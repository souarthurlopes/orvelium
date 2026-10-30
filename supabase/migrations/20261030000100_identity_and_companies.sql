-- Stage 1 only: no local Clients/Quotes/Services data is migrated.
create schema if not exists private;
revoke all on schema private from public;

create type public.company_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.company_permission as enum ('company.read', 'company.update', 'members.read', 'members.manage', 'roles.grant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  legal_name text check (legal_name is null or char_length(btrim(legal_name)) between 1 and 180),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.company_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index company_memberships_by_user on public.company_memberships(user_id, company_id);
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_company_id uuid references public.companies(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table private.role_permissions (
  role public.company_role not null,
  permission public.company_permission not null,
  primary key(role, permission)
);
insert into private.role_permissions(role,permission) values
  ('owner','company.read'),('owner','company.update'),('owner','members.read'),('owner','members.manage'),('owner','roles.grant'),
  ('admin','company.read'),('admin','company.update'),('admin','members.read'),
  ('member','company.read'),('member','members.read'),
  ('viewer','company.read');

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := pg_catalog.now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();
create trigger companies_updated before update on public.companies for each row execute function private.touch_updated_at();
create trigger memberships_updated before update on public.company_memberships for each row execute function private.touch_updated_at();
create trigger preferences_updated before update on public.user_preferences for each row execute function private.touch_updated_at();

-- Auth metadata can supply a display name, never company membership or a role.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, pg_catalog.left(coalesce(new.raw_user_meta_data ->> 'full_name',''),120))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
insert into public.profiles(id,full_name)
select id, pg_catalog.left(coalesce(raw_user_meta_data ->> 'full_name',''),120) from auth.users
on conflict (id) do nothing;

-- These helpers bypass membership RLS to avoid recursive policies; they always
-- derive the caller from auth.uid(), never from user-controlled metadata/IDs.
create function private.is_company_member(p_company_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.company_memberships m where m.company_id=p_company_id and m.user_id=auth.uid());
$$;
create function private.has_company_permission(p_company_id uuid, p_permission public.company_permission) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.company_memberships m join private.role_permissions p on p.role=m.role
    where m.company_id=p_company_id and m.user_id=auth.uid() and p.permission=p_permission);
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.user_preferences enable row level security;
alter table private.role_permissions enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy companies_read_members on public.companies for select to authenticated using (private.is_company_member(id));
create policy companies_update_authorized on public.companies for update to authenticated
  using (private.has_company_permission(id,'company.update')) with check (private.has_company_permission(id,'company.update'));
create policy memberships_read_scoped on public.company_memberships for select to authenticated
  using (user_id=(select auth.uid()) or private.has_company_permission(company_id,'members.read'));
create policy preferences_read_self on public.user_preferences for select to authenticated using (user_id=(select auth.uid()));

-- Writes of memberships and active-company selection have no client write policy.
-- Only the narrowly authorized RPCs in the next migration can perform them.
revoke all on table public.profiles,public.companies,public.company_memberships,public.user_preferences from public,anon,authenticated;
revoke all on table private.role_permissions from public,anon,authenticated;
grant select on public.profiles,public.companies,public.company_memberships,public.user_preferences to authenticated;
grant update(full_name) on public.profiles to authenticated;
grant update(name,legal_name) on public.companies to authenticated;
grant usage on schema public,private to authenticated;
revoke all on function private.touch_updated_at(),private.handle_new_user(),private.is_company_member(uuid),private.has_company_permission(uuid,public.company_permission) from public,anon,authenticated;
grant execute on function private.is_company_member(uuid),private.has_company_permission(uuid,public.company_permission) to authenticated;
