-- Incremental Quotes integration. Requires the identity/company and Clients migrations.
-- No local records are imported; existing migrations/tables are not modified.
begin;

do $$
begin
 if to_regclass('public.clients') is null or to_regclass('public.company_memberships') is null or to_regprocedure('private.touch_updated_at()') is null then
  raise exception 'Identity/company and Clients migrations must already be installed' using errcode='55000';
 end if;
end;
$$;

create table private.quote_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_number bigint not null check (last_number between 1 and 9007199254740990)
);
alter table private.quote_counters enable row level security;
revoke all on table private.quote_counters from public,anon,authenticated;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  number bigint not null check (number between 1 and 9007199254740990),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  -- Historical UUID deliberately survives client deletion; RPCs validate company ownership.
  client_id uuid not null,
  client_snapshot jsonb not null check (jsonb_typeof(client_snapshot)='object' and client_snapshot->>'id' is not null and client_snapshot->>'id'=client_id::text),
  company_snapshot jsonb not null check (jsonb_typeof(company_snapshot)='object' and company_snapshot->>'name' is not null and jsonb_typeof(company_snapshot->'name')='string' and char_length(btrim(company_snapshot->>'name')) between 1 and 120),
  date date not null,
  valid_until date not null check (valid_until>=date),
  status text not null check (status in ('draft','sent','approved','rejected','expired')),
  items jsonb not null check (jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100),
  discount_kind text not null check (discount_kind in ('fixed','percent')),
  discount_value bigint not null check (discount_value>=0 and (discount_kind<>'percent' or discount_value<=10000)),
  subtotal_cents bigint not null check (subtotal_cents between 0 and 1000000000000),
  discount_cents bigint not null check (discount_cents between 0 and subtotal_cents),
  total_cents bigint not null check (total_cents=subtotal_cents-discount_cents),
  notes text not null default '' check (char_length(notes)<=4000),
  payment_terms text not null default '' check (char_length(payment_terms)<=2000),
  issued_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status='draft' or issued_at is not null),
  constraint quotes_company_number_key unique(company_id,number)
);
create index quotes_company_date on public.quotes(company_id,date,id);
create index quotes_company_client on public.quotes(company_id,client_id);
create trigger quotes_updated before update on public.quotes for each row execute function private.touch_updated_at();

create function private.has_quotes_access(p_company_id uuid,p_operation text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_memberships m join auth.users u on u.id=m.user_id
  where m.company_id=p_company_id and m.user_id=auth.uid() and u.email_confirmed_at is not null
  and case p_operation when 'read' then m.role in ('owner','admin','member','viewer')
    when 'create' then m.role in ('owner','admin','member')
    when 'update' then m.role in ('owner','admin','member')
    when 'delete' then m.role in ('owner','admin') else false end);
$$;
-- Invoked only by SECURITY DEFINER RPCs; the row lock serializes revocation/role changes.
create function private.require_quote_access(p_company_id uuid,p_operation text) returns void
language plpgsql set search_path='' as $$
declare v_role public.company_role;
begin
 select m.role into v_role from public.company_memberships m join auth.users u on u.id=m.user_id
 where m.company_id=p_company_id and m.user_id=auth.uid() and u.email_confirmed_at is not null for share of m;
 if not found or not (case p_operation when 'create' then v_role in ('owner','admin','member')
  when 'update' then v_role in ('owner','admin','member') when 'delete' then v_role in ('owner','admin') else false end) then
  raise exception 'Quote permission required' using errcode='42501';
 end if;
end;
$$;

-- Canonicalize business input and calculate all totals with exact numeric arithmetic.
create function private.validate_quote_input(p_input jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare v_item jsonb; v_items jsonb:='[]'::jsonb; v_ids text[]:='{}'; v_id text;
 v_qty numeric; v_price numeric; v_line numeric; v_subtotal numeric:=0; v_value numeric; v_discount numeric; v_kind text;
 v_date date; v_until date; v_client uuid;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid quote' using errcode='22023'; end if;
 if jsonb_typeof(p_input->'clientId') is distinct from 'string' or (p_input->>'clientId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid client' using errcode='22023'; end if;
 v_client:=(p_input->>'clientId')::uuid;
 if jsonb_typeof(p_input->'date') is distinct from 'string' or jsonb_typeof(p_input->'validUntil') is distinct from 'string'
 or (p_input->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (p_input->>'validUntil') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid dates' using errcode='22023'; end if;
 v_date:=(p_input->>'date')::date; v_until:=(p_input->>'validUntil')::date;
 if v_until<v_date then raise exception 'Invalid validity' using errcode='22023'; end if;
 if jsonb_typeof(p_input->'status') is distinct from 'string' or p_input->>'status' not in ('draft','sent','approved','rejected','expired') then raise exception 'Invalid status' using errcode='22023'; end if;
 if p_input->>'status'='expired' and v_until>=(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Quote has not expired' using errcode='22023'; end if;
 if jsonb_typeof(p_input->'notes') is distinct from 'string' or char_length(p_input->>'notes')>4000
 or jsonb_typeof(p_input->'paymentTerms') is distinct from 'string' or char_length(p_input->>'paymentTerms')>2000 then raise exception 'Invalid quote text' using errcode='22023'; end if;
 if jsonb_typeof(p_input->'items') is distinct from 'array' then raise exception 'Invalid items' using errcode='22023'; end if;
 if jsonb_array_length(p_input->'items') not between 1 and 100 then raise exception 'Invalid item count' using errcode='22023'; end if;
 for v_item in select value from jsonb_array_elements(p_input->'items') loop
  if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item->'id') is distinct from 'string'
   or char_length(v_item->>'id') not between 1 and 100
   or jsonb_typeof(v_item->'description') is distinct from 'string' or char_length(btrim(v_item->>'description'))<1 or char_length(v_item->>'description')>300
   or jsonb_typeof(v_item->'unit') is distinct from 'string' or char_length(btrim(v_item->>'unit'))<1 or char_length(v_item->>'unit')>20
   or jsonb_typeof(v_item->'quantityMilli') is distinct from 'number' or jsonb_typeof(v_item->'unitPriceCents') is distinct from 'number' then raise exception 'Invalid item fields' using errcode='22023'; end if;
  v_id:=v_item->>'id'; if v_id=any(v_ids) then raise exception 'Duplicate item ID' using errcode='22023'; end if; v_ids:=array_append(v_ids,v_id);
  v_qty:=(v_item->>'quantityMilli')::numeric; v_price:=(v_item->>'unitPriceCents')::numeric;
  if v_qty<>trunc(v_qty) or v_price<>trunc(v_price) or v_qty not between 1 and 1000000000 or v_price not between 0 and 10000000000 then raise exception 'Invalid item values' using errcode='22023'; end if;
  v_line:=floor((v_qty*v_price+500)/1000); v_subtotal:=v_subtotal+v_line;
  if v_subtotal>1000000000000 then raise exception 'Quote total limit' using errcode='22023'; end if;
  v_items:=v_items||jsonb_build_array(jsonb_build_object('id',v_id,'description',btrim(v_item->>'description'),'unit',btrim(v_item->>'unit'),'quantityMilli',v_qty,'unitPriceCents',v_price));
 end loop;
 if jsonb_typeof(p_input->'discount') is distinct from 'object' or jsonb_typeof(p_input->'discount'->'kind') is distinct from 'string'
 or p_input->'discount'->>'kind' not in ('fixed','percent') or jsonb_typeof(p_input->'discount'->'value') is distinct from 'number' then raise exception 'Invalid discount' using errcode='22023'; end if;
 v_kind:=p_input->'discount'->>'kind';v_value:=(p_input->'discount'->>'value')::numeric;
 if v_value<>trunc(v_value) or v_value<0 or v_value>1000000000000 or (v_kind='percent' and v_value>10000) then raise exception 'Invalid discount value' using errcode='22023'; end if;
 v_discount:=case when v_kind='fixed' then v_value else floor((v_subtotal*v_value+5000)/10000) end;
 if v_discount>v_subtotal then raise exception 'Discount exceeds subtotal' using errcode='22023'; end if;
 return jsonb_build_object('clientId',v_client,'date',v_date,'validUntil',v_until,'status',p_input->>'status','items',v_items,
  'discount',jsonb_build_object('kind',v_kind,'value',v_value),'notes',btrim(p_input->>'notes'),'paymentTerms',btrim(p_input->>'paymentTerms'),
  'subtotal',v_subtotal,'discountCents',v_discount,'total',v_subtotal-v_discount);
end;
$$;

create function private.capture_quote_client(p_company_id uuid,p_client_id uuid) returns jsonb
language plpgsql set search_path='' as $$
declare v_snapshot jsonb;
begin
 select jsonb_build_object('id',c.id,'name',c.name,'type',c.type,'document',c.document,'phone',c.phone,'email',c.email,'address',c.address,'city',c.city,'state',c.state)
 into v_snapshot from public.clients c where c.id=p_client_id and c.company_id=p_company_id for share of c;
 if not found then raise exception 'Client unavailable in company' using errcode='P0002'; end if;
 return v_snapshot;
end;
$$;

create function public.create_quote(p_company_id uuid,p_input jsonb) returns setof public.quotes
language plpgsql security definer set search_path='' as $$
declare v jsonb; v_snapshot jsonb; v_name text; v_number bigint; v_row public.quotes;
begin
 perform private.require_quote_access(p_company_id,'create');
 v:=private.validate_quote_input(p_input);v_snapshot:=private.capture_quote_client(p_company_id,(v->>'clientId')::uuid);
 select c.name into v_name from public.companies c where c.id=p_company_id;
 insert into private.quote_counters as counter(company_id,last_number) values(p_company_id,1)
 on conflict(company_id) do update set last_number=counter.last_number+1 where counter.last_number<9007199254740990 returning last_number into v_number;
 if v_number is null then raise exception 'Quote number limit' using errcode='22023'; end if;
 insert into public.quotes(company_id,number,client_id,client_snapshot,company_snapshot,date,valid_until,status,items,discount_kind,discount_value,subtotal_cents,discount_cents,total_cents,notes,payment_terms,issued_at)
 values(p_company_id,v_number,(v->>'clientId')::uuid,v_snapshot,jsonb_build_object('name',v_name),(v->>'date')::date,(v->>'validUntil')::date,v->>'status',v->'items',v->'discount'->>'kind',(v->'discount'->>'value')::bigint,(v->>'subtotal')::bigint,(v->>'discountCents')::bigint,(v->>'total')::bigint,v->>'notes',v->>'paymentTerms',case when v->>'status'='draft' then null else now() end) returning * into v_row;
 return next v_row;
end;
$$;

create function public.update_quote(p_company_id uuid,p_quote_id uuid,p_revision bigint,p_input jsonb) returns setof public.quotes
language plpgsql security definer set search_path='' as $$
declare v jsonb; v_previous public.quotes; v_row public.quotes; v_snapshot jsonb;
begin
 perform private.require_quote_access(p_company_id,'update');
 select * into v_previous from public.quotes q where q.id=p_quote_id and q.company_id=p_company_id for update;
 if not found then raise exception 'Quote unavailable in company' using errcode='P0002'; end if;
 if p_revision is null or v_previous.revision<>p_revision then raise exception 'Stale quote revision' using errcode='40001'; end if;
 v:=private.validate_quote_input(p_input);
 if v_previous.issued_at is not null then
  if (v->>'clientId')::uuid<>v_previous.client_id then raise exception 'Issued client is immutable' using errcode='22023'; end if;
  v_snapshot:=v_previous.client_snapshot;
 else v_snapshot:=private.capture_quote_client(p_company_id,(v->>'clientId')::uuid);end if;
 update public.quotes set client_id=(v->>'clientId')::uuid,client_snapshot=v_snapshot,date=(v->>'date')::date,valid_until=(v->>'validUntil')::date,
 status=v->>'status',items=v->'items',discount_kind=v->'discount'->>'kind',discount_value=(v->'discount'->>'value')::bigint,
 subtotal_cents=(v->>'subtotal')::bigint,discount_cents=(v->>'discountCents')::bigint,total_cents=(v->>'total')::bigint,
 notes=v->>'notes',payment_terms=v->>'paymentTerms',revision=revision+1,
 issued_at=coalesce(v_previous.issued_at,case when v->>'status'='draft' then null else now() end)
 where id=p_quote_id and company_id=p_company_id returning * into v_row;
 return next v_row;
end;
$$;

create function public.remove_quote(p_company_id uuid,p_quote_id uuid,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare v_previous public.quotes;
begin
 perform private.require_quote_access(p_company_id,'delete');
 select * into v_previous from public.quotes q where q.id=p_quote_id and q.company_id=p_company_id for update;
 if not found then raise exception 'Quote unavailable in company' using errcode='P0002'; end if;
 if p_revision is null or v_previous.revision<>p_revision then raise exception 'Stale quote revision' using errcode='40001'; end if;
 delete from public.quotes where id=p_quote_id and company_id=p_company_id;
end;
$$;

alter table public.quotes enable row level security;
create policy quotes_read on public.quotes for select to authenticated using(private.has_quotes_access(company_id,'read'));
create policy quotes_create on public.quotes for insert to authenticated with check(private.has_quotes_access(company_id,'create'));
create policy quotes_update on public.quotes for update to authenticated using(private.has_quotes_access(company_id,'update')) with check(private.has_quotes_access(company_id,'update'));
create policy quotes_delete on public.quotes for delete to authenticated using(private.has_quotes_access(company_id,'delete'));
revoke all on table public.quotes from public,anon,authenticated;
grant select on table public.quotes to authenticated;
revoke all on function private.has_quotes_access(uuid,text),private.require_quote_access(uuid,text),private.validate_quote_input(jsonb),private.capture_quote_client(uuid,uuid),public.create_quote(uuid,jsonb),public.update_quote(uuid,uuid,bigint,jsonb),public.remove_quote(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function private.has_quotes_access(uuid,text),public.create_quote(uuid,jsonb),public.update_quote(uuid,uuid,bigint,jsonb),public.remove_quote(uuid,uuid,bigint) to authenticated;
commit;
