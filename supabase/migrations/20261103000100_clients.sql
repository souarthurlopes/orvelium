-- Incremental migration: requires the two 20261030 migrations already installed.
-- Does not import local data or modify identity/company tables.
begin;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  type text not null check (type in ('individual','company')),
  status text not null default 'active' check (status in ('active','inactive')),
  name text not null check (name=btrim(name) and char_length(name) between 1 and 120),
  document text not null check (
    (type='individual' and document ~ '^[0-9]{11}$') or
    (type='company' and document ~ '^[0-9]{14}$')
  ),
  phone text not null default '' check (phone='' or phone ~ '^[0-9]{10,11}$'),
  email text not null default '' check (char_length(email)<=160 and (email='' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  address text not null default '' check (char_length(address)<=200),
  city text not null default '' check (char_length(city)<=80),
  state text not null default '' check (state in ('','AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  notes text not null default '' check (char_length(notes)<=2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_company_document_key unique (company_id,document)
);
create index clients_company_name_id on public.clients(company_id,name,id);
create index clients_company_status on public.clients(company_id,status);
create trigger clients_updated before update on public.clients
  for each row execute function private.touch_updated_at();

-- Actor is always auth.uid(); no caller-supplied user/role or JWT metadata.
-- Current membership and confirmed account are checked on every statement.
create function private.has_clients_access(p_company_id uuid,p_operation text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.company_memberships m
    join auth.users u on u.id=m.user_id
    where m.company_id=p_company_id and m.user_id=auth.uid() and u.email_confirmed_at is not null
      and case p_operation
        when 'read' then m.role in ('owner','admin','member','viewer')
        when 'create' then m.role in ('owner','admin','member')
        when 'update' then m.role in ('owner','admin','member')
        when 'delete' then m.role in ('owner','admin')
        else false
      end
  );
$$;
revoke all on function private.has_clients_access(uuid,text) from public,anon,authenticated;
grant execute on function private.has_clients_access(uuid,text) to authenticated;

alter table public.clients enable row level security;
create policy clients_read on public.clients for select to authenticated
  using (private.has_clients_access(company_id,'read'));
create policy clients_create on public.clients for insert to authenticated
  with check (private.has_clients_access(company_id,'create'));
create policy clients_update on public.clients for update to authenticated
  using (private.has_clients_access(company_id,'update'))
  with check (private.has_clients_access(company_id,'update'));
create policy clients_delete on public.clients for delete to authenticated
  using (private.has_clients_access(company_id,'delete'));

-- Identity, company, author and timestamps are not writable by API clients.
revoke all on table public.clients from public,anon,authenticated;
grant select,delete on table public.clients to authenticated;
grant insert(company_id,type,status,name,document,phone,email,address,city,state,notes) on public.clients to authenticated;
grant update(type,status,name,document,phone,email,address,city,state,notes) on public.clients to authenticated;

commit;
