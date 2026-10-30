-- Atomic company creation: no company ID, role or owner ID is accepted as input.
create function public.create_company(p_name text, p_legal_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_company uuid;
begin
  if v_user is null or not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null) then
    raise exception 'A confirmed email account is required' using errcode='42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 or (p_legal_name is not null and char_length(btrim(p_legal_name))>180) then
    raise exception 'Invalid company fields' using errcode='22023';
  end if;
  insert into public.companies(name,legal_name,created_by) values(btrim(p_name),nullif(btrim(p_legal_name),''),v_user) returning id into v_company;
  insert into public.company_memberships(company_id,user_id,role) values(v_company,v_user,'owner');
  insert into public.user_preferences(user_id,active_company_id) values(v_user,v_company)
    on conflict(user_id) do update set active_company_id=excluded.active_company_id;
  return v_company;
end;
$$;
create function public.set_active_company(p_company_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_company_member(p_company_id) then raise exception 'Membership required' using errcode='42501'; end if;
  insert into public.user_preferences(user_id,active_company_id) values(auth.uid(),p_company_id)
    on conflict(user_id) do update set active_company_id=excluded.active_company_id;
end;
$$;

-- Only owners have members.manage / roles.grant. Admins cannot promote users.
create function public.add_company_member(p_company_id uuid,p_user_id uuid,p_role public.company_role default 'member') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.has_company_permission(p_company_id,'members.manage') then raise exception 'Owner permission required' using errcode='42501'; end if;
  if p_role is null or p_role='owner' or p_user_id=auth.uid() then raise exception 'Invalid role assignment' using errcode='42501'; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null) then raise exception 'Confirmed user required' using errcode='22023'; end if;
  insert into public.company_memberships(company_id,user_id,role) values(p_company_id,p_user_id,p_role) returning id into v_id;
  return v_id;
end;
$$;
create function public.set_company_member_role(p_company_id uuid,p_user_id uuid,p_role public.company_role) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.company_role;
begin
  if not private.has_company_permission(p_company_id,'roles.grant') then raise exception 'Owner permission required' using errcode='42501'; end if;
  if p_role is null or p_role='owner' or p_user_id=auth.uid() then raise exception 'Invalid role assignment' using errcode='42501'; end if;
  select role into v_role from public.company_memberships where company_id=p_company_id and user_id=p_user_id for update;
  if not found or v_role='owner' then raise exception 'Membership cannot be changed' using errcode='42501'; end if;
  update public.company_memberships set role=p_role where company_id=p_company_id and user_id=p_user_id;
end;
$$;
create function public.remove_company_member(p_company_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.company_role;
begin
  if not private.has_company_permission(p_company_id,'members.manage') then raise exception 'Owner permission required' using errcode='42501'; end if;
  select role into v_role from public.company_memberships where company_id=p_company_id and user_id=p_user_id for update;
  if not found or v_role='owner' then raise exception 'Owner cannot be removed' using errcode='42501'; end if;
  delete from public.company_memberships where company_id=p_company_id and user_id=p_user_id;
end;
$$;

create function private.protect_membership_integrity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.company_id<>old.company_id or new.user_id<>old.user_id or new.id<>old.id) then
    raise exception 'Membership identity is immutable' using errcode='23514';
  end if;
  if old.role='owner' and (tg_op='DELETE' or new.role<>'owner')
    and exists(select 1 from public.companies where id=old.company_id)
    and not exists(select 1 from public.company_memberships where company_id=old.company_id and role='owner' and id<>old.id) then
    raise exception 'Last owner cannot be removed' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger protect_memberships before update or delete on public.company_memberships for each row execute function private.protect_membership_integrity();
create function private.clear_removed_active_company() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.user_preferences set active_company_id=null where user_id=old.user_id and active_company_id=old.company_id;
  return old;
end;
$$;
create trigger membership_removed after delete on public.company_memberships for each row execute function private.clear_removed_active_company();

revoke all on function public.create_company(text,text),public.set_active_company(uuid),public.add_company_member(uuid,uuid,public.company_role),public.set_company_member_role(uuid,uuid,public.company_role),public.remove_company_member(uuid,uuid),private.protect_membership_integrity(),private.clear_removed_active_company() from public,anon,authenticated;
grant execute on function public.create_company(text,text),public.set_active_company(uuid),public.add_company_member(uuid,uuid,public.company_role),public.set_company_member_role(uuid,uuid,public.company_role),public.remove_company_member(uuid,uuid) to authenticated;
