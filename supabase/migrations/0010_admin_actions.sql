-- 0010_admin_actions.sql
-- Operator (admin) system — Phase 2 actions.
--
-- Adds mutation RPCs for:
--   * bootstrap: insert the very first super_admin (only allowed when admin_users is empty)
--   * admin_users CRUD: invite, change role, remove (super_admin only)
--   * organizations CRUD: create, update status (admin only)
--   * user lifecycle: suspend, restore, schedule deletion (admin only, GDPR-friendly)
--
-- Every mutating RPC writes to public.admin_action_logs for compliance.

-- ---------- helper: log an admin action ----------
create or replace function public.log_admin_action(
  p_admin_id     uuid,
  p_action_type  text,
  p_target_kind  text default null,
  p_target_id    uuid default null,
  p_metadata     jsonb default '{}'::jsonb
) returns void
  language sql
  security definer
  set search_path = public
as $$
  insert into public.admin_action_logs (admin_id, action_type, target_kind, target_id, metadata)
  values (p_admin_id, p_action_type, p_target_kind, p_target_id, p_metadata);
$$;

revoke all on function public.log_admin_action(uuid, text, text, uuid, jsonb) from public;
-- internal helper — not granted to authenticated; only called from other SECURITY DEFINER fns.

-- ---------- users.status column (added here to keep the schema migration linear) ----------
do $$ begin
  alter table public.users add column status text not null default 'active'
    check (status in ('active', 'suspended', 'pending_deletion'));
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table public.users add column suspended_at timestamptz;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table public.users add column deletion_scheduled_for timestamptz;
exception when duplicate_column then null;
end $$;

-- ---------- bootstrap: create the first super_admin ----------
-- Allowed only when admin_users is empty. After the first row is inserted, all
-- subsequent admin_users writes must come from an existing super_admin (via the
-- RLS policy + RPCs below).
create or replace function public.admin_bootstrap_first_super_admin(
  bootstrap_user_id uuid,
  bootstrap_email   text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if exists (select 1 from public.admin_users) then
    raise exception 'ADMIN_BOOTSTRAP_ALREADY_DONE' using errcode = '42501';
  end if;
  if bootstrap_user_id is null or bootstrap_email is null then
    raise exception 'INVALID_ARGS' using errcode = '22023';
  end if;

  insert into public.admin_users (id, email, role, created_by)
  values (bootstrap_user_id, bootstrap_email, 'super_admin', bootstrap_user_id);
  -- Log the bootstrap event using the new admin's own id (no other admin exists yet).
  perform public.log_admin_action(
    bootstrap_user_id,
    'bootstrap_super_admin',
    'admin',
    bootstrap_user_id,
    jsonb_build_object('email', bootstrap_email)
  );
end;
$$;

-- Anyone (anon/authenticated) can call this — but it self-blocks after the first run.
revoke all on function public.admin_bootstrap_first_super_admin(uuid, text) from public;
grant execute on function public.admin_bootstrap_first_super_admin(uuid, text) to anon, authenticated;

-- ---------- admin_users management (super_admin only) ----------
create or replace function public.is_super_admin() returns boolean
  language sql stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and role = 'super_admin'
  )
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.admin_invite_admin(
  target_user_id uuid,
  target_email   text,
  target_role    text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not public.is_super_admin() then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if target_role not in ('super_admin', 'support', 'read_only') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;

  insert into public.admin_users (id, email, role, created_by)
  values (target_user_id, target_email, target_role, caller_id)
  on conflict (id) do update set role = excluded.role, email = excluded.email;

  perform public.log_admin_action(
    caller_id, 'invite_admin', 'admin', target_user_id,
    jsonb_build_object('email', target_email, 'role', target_role)
  );
end;
$$;

revoke all on function public.admin_invite_admin(uuid, text, text) from public;
grant execute on function public.admin_invite_admin(uuid, text, text) to authenticated;

create or replace function public.admin_update_admin_role(
  target_user_id uuid,
  new_role       text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  old_role  text;
begin
  if not public.is_super_admin() then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if new_role not in ('super_admin', 'support', 'read_only') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;

  select role into old_role from public.admin_users where id = target_user_id;
  if old_role is null then
    raise exception 'ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Safety: cannot demote yourself from the only super_admin.
  if caller_id = target_user_id and old_role = 'super_admin' and new_role <> 'super_admin' then
    if (select count(*) from public.admin_users where role = 'super_admin') = 1 then
      raise exception 'LAST_SUPER_ADMIN_PROTECTED' using errcode = '42501';
    end if;
  end if;

  update public.admin_users set role = new_role where id = target_user_id;

  perform public.log_admin_action(
    caller_id, 'update_admin_role', 'admin', target_user_id,
    jsonb_build_object('from', old_role, 'to', new_role)
  );
end;
$$;

revoke all on function public.admin_update_admin_role(uuid, text) from public;
grant execute on function public.admin_update_admin_role(uuid, text) to authenticated;

create or replace function public.admin_remove_admin(
  target_user_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  victim_role text;
begin
  if not public.is_super_admin() then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select role into victim_role from public.admin_users where id = target_user_id;
  if victim_role is null then
    raise exception 'ADMIN_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Safety: cannot remove the last super_admin (would lock the system).
  if victim_role = 'super_admin'
     and (select count(*) from public.admin_users where role = 'super_admin') = 1 then
    raise exception 'LAST_SUPER_ADMIN_PROTECTED' using errcode = '42501';
  end if;

  delete from public.admin_users where id = target_user_id;

  perform public.log_admin_action(
    caller_id, 'remove_admin', 'admin', target_user_id,
    jsonb_build_object('removed_role', victim_role)
  );
end;
$$;

revoke all on function public.admin_remove_admin(uuid) from public;
grant execute on function public.admin_remove_admin(uuid) to authenticated;

create or replace function public.admin_list_admins()
  returns table (
    id          uuid,
    email       text,
    role        text,
    created_at  timestamptz,
    created_by  uuid
  )
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return query
  select a.id, a.email, a.role, a.created_at, a.created_by
  from public.admin_users a
  order by a.created_at asc;
end;
$$;

revoke all on function public.admin_list_admins() from public;
grant execute on function public.admin_list_admins() to authenticated;

-- ---------- organizations CRUD (any admin can create/edit) ----------
create or replace function public.admin_create_org(
  org_name  text,
  org_slug  text,
  owner_id  uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  new_id    uuid;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, owner_id)
  values (org_name, org_slug, owner_id)
  returning id into new_id;

  -- Seed the owner row in organization_members.
  insert into public.organization_members (org_id, user_id, role)
  values (new_id, owner_id, 'owner')
  on conflict do nothing;

  perform public.log_admin_action(
    caller_id, 'create_org', 'org', new_id,
    jsonb_build_object('name', org_name, 'slug', org_slug, 'owner_id', owner_id)
  );
  return new_id;
end;
$$;

revoke all on function public.admin_create_org(text, text, uuid) from public;
grant execute on function public.admin_create_org(text, text, uuid) to authenticated;

create or replace function public.admin_update_org_status(
  org_id     uuid,
  new_status text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  old_status text;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if new_status not in ('active', 'suspended', 'deleted') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  select status into old_status from public.organizations where id = org_id;
  if old_status is null then
    raise exception 'ORG_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.organizations set status = new_status where id = org_id;

  perform public.log_admin_action(
    caller_id, 'update_org_status', 'org', org_id,
    jsonb_build_object('from', old_status, 'to', new_status)
  );
end;
$$;

revoke all on function public.admin_update_org_status(uuid, text) from public;
grant execute on function public.admin_update_org_status(uuid, text) to authenticated;

-- ---------- user lifecycle (suspend / restore / schedule deletion) ----------
-- ZK note: none of these RPCs read or expose vault ciphertext. They only flip
-- a status flag. Actual data deletion is deferred to a separate batch job that
-- runs after deletion_scheduled_for has passed.
create or replace function public.admin_suspend_user(
  target_user_id uuid,
  reason         text default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update public.users
     set status = 'suspended',
         suspended_at = now()
   where id = target_user_id and status <> 'suspended';

  if not found then
    raise exception 'USER_NOT_FOUND_OR_ALREADY_SUSPENDED' using errcode = 'P0002';
  end if;

  perform public.log_admin_action(
    caller_id, 'suspend_user', 'user', target_user_id,
    jsonb_build_object('reason', coalesce(reason, ''))
  );
end;
$$;

revoke all on function public.admin_suspend_user(uuid, text) from public;
grant execute on function public.admin_suspend_user(uuid, text) to authenticated;

create or replace function public.admin_restore_user(
  target_user_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update public.users
     set status = 'active',
         suspended_at = null,
         deletion_scheduled_for = null
   where id = target_user_id and status in ('suspended', 'pending_deletion');

  if not found then
    raise exception 'USER_NOT_SUSPENDED_OR_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.log_admin_action(
    caller_id, 'restore_user', 'user', target_user_id, '{}'::jsonb
  );
end;
$$;

revoke all on function public.admin_restore_user(uuid) from public;
grant execute on function public.admin_restore_user(uuid) to authenticated;

-- Schedule deletion 30 days out (GDPR-friendly grace period; user can restore in the meantime).
create or replace function public.admin_schedule_user_deletion(
  target_user_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  scheduled_for timestamptz := now() + interval '30 days';
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update public.users
     set status = 'pending_deletion',
         deletion_scheduled_for = scheduled_for
   where id = target_user_id;

  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.log_admin_action(
    caller_id, 'schedule_user_deletion', 'user', target_user_id,
    jsonb_build_object('scheduled_for', scheduled_for)
  );
end;
$$;

revoke all on function public.admin_schedule_user_deletion(uuid) from public;
grant execute on function public.admin_schedule_user_deletion(uuid) to authenticated;

-- Extend admin_list_users to surface the new status column.
-- DROP first because PostgreSQL forbids changing the returns table shape via CREATE OR REPLACE.
drop function if exists public.admin_list_users(text, int, int);
create or replace function public.admin_list_users(
  search_query text default null,
  limit_count  int  default 50,
  offset_count int  default 0
)
  returns table (
    id              uuid,
    email           text,
    created_at      timestamptz,
    item_count      bigint,
    last_audit_at   timestamptz,
    recovery_enabled boolean,
    status          text,
    suspended_at    timestamptz,
    deletion_scheduled_for timestamptz
  )
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email,
    u.created_at,
    (select count(*) from public.encrypted_vault_items v where v.user_id = u.id)::bigint as item_count,
    (select max(created_at) from public.audit_events a where a.user_id = u.id) as last_audit_at,
    u.recovery_enabled,
    u.status,
    u.suspended_at,
    u.deletion_scheduled_for
  from public.users u
  where search_query is null
     or u.email ilike '%' || search_query || '%'
  order by u.created_at desc
  limit limit_count
  offset offset_count;
end;
$$;

revoke all on function public.admin_list_users(text, int, int) from public;
grant execute on function public.admin_list_users(text, int, int) to authenticated;
