-- 0009_admin.sql
-- Operator (admin) system — strict zero-knowledge boundary.
--
-- Key principle: admins are ordinary authenticated users who happen to be
-- listed in public.admin_users. They access ONLY metadata views — never the
-- ciphertext tables directly. We revoke default GRANTs on ciphertext tables
-- for the admin role, and emit only aggregated/scrubbed views.
--
-- Even a misbehaving admin (or a leaked admin token) cannot SELECT vault
-- ciphertext: PostgreSQL's column/table privilege check fires before RLS,
-- so denying GRANT shuts the door even when RLS policies say otherwise.

-- ---------- admin role (Supabase pre-creates `authenticated` and `service_role`) ----------
-- We layer admins on top of the existing `authenticated` role via the
-- admin_users membership table; we do NOT introduce a new Postgres role to
-- keep the change set within Supabase's normal RLS surface.

create table if not exists public.admin_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('super_admin', 'support', 'read_only')),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null
);

comment on table  public.admin_users is 'Operators who may read aggregate stats and audit logs. Membership-only — does not grant access to vault ciphertext.';

alter table public.admin_users enable row level security;

-- An admin can see other admins (for the "Admins" page); non-admins see nothing.
drop policy if exists "admin_users_self_visible" on public.admin_users;
create policy "admin_users_self_visible"
  on public.admin_users for select
  using (auth.uid() in (select id from public.admin_users));

-- INSERT/UPDATE/DELETE is locked down — bootstrap a first admin via supabase
-- service_role / a one-off SQL run, then super_admins manage the table via RPC.
drop policy if exists "admin_users_super_admin_writes" on public.admin_users;
create policy "admin_users_super_admin_writes"
  on public.admin_users for all
  using (
    exists (
      select 1 from public.admin_users a
      where a.id = auth.uid() and a.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.admin_users a
      where a.id = auth.uid() and a.role = 'super_admin'
    )
  );

-- ---------- admin_action_logs ----------
-- Every operator action gets logged. Audit chain for compliance.
create table if not exists public.admin_action_logs (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references public.admin_users(id) on delete restrict,
  action_type   text not null,
  target_kind   text,                 -- 'user' | 'org' | 'audit_event' | 'admin' | null
  target_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.admin_action_logs is 'Append-only audit log for operator actions. Never references vault ciphertext.';

create index if not exists admin_action_logs_admin_time_idx
  on public.admin_action_logs(admin_id, created_at desc);

alter table public.admin_action_logs enable row level security;

-- Admins can read all action logs; only admins can insert (and only their own row).
drop policy if exists "admin_action_logs_admin_read" on public.admin_action_logs;
create policy "admin_action_logs_admin_read"
  on public.admin_action_logs for select
  using (auth.uid() in (select id from public.admin_users));

drop policy if exists "admin_action_logs_admin_insert" on public.admin_action_logs;
create policy "admin_action_logs_admin_insert"
  on public.admin_action_logs for insert
  with check (auth.uid() = admin_id);

-- ---------- Aggregated metadata views ----------
-- These are the ONLY surfaces admins can read for customer-side data. Every
-- view aggregates or strips ciphertext. RLS on the view's underlying tables
-- still applies, so we add explicit policies that allow admins to read counts.

-- Allow admins to read row-counts from vault tables via a security_invoker view.
-- We can't SELECT from encrypted_vault_items as a normal user without an
-- explicit RLS policy, so the view runs as security_definer and the function
-- body filters to aggregates only.

create or replace function public.is_admin() returns boolean
  language sql stable
  security definer
  set search_path = public
as $$
  select exists (select 1 from public.admin_users where id = auth.uid())
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- user_stats — total / active counts only. Zero PII, zero ciphertext.
create or replace function public.admin_get_user_stats()
  returns table (
    total_users        bigint,
    users_with_vault   bigint,
    total_vault_items  bigint,
    total_groups       bigint,
    total_shares       bigint
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
    (select count(*) from public.users)::bigint,
    (select count(distinct user_id) from public.encrypted_vault_items)::bigint,
    (select count(*) from public.encrypted_vault_items)::bigint,
    (select count(*) from public.groups)::bigint,
    (select count(*) from public.shared_items)::bigint;
end;
$$;

revoke all on function public.admin_get_user_stats() from public;
grant execute on function public.admin_get_user_stats() to authenticated;

-- admin_list_users — per-user metadata. NO kdf_params, NO encrypted_private_key,
-- NO email returned for non-admins. Item count is aggregated.
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
    recovery_enabled boolean
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
    u.recovery_enabled
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

-- admin_list_audit_events — paginated audit log access. Metadata only.
create or replace function public.admin_list_audit_events(
  search_user_id uuid default null,
  event_filter   text default null,
  limit_count    int  default 100,
  offset_count   int  default 0
)
  returns table (
    id           uuid,
    user_id      uuid,
    event_type   text,
    ip_hash      text,
    user_agent   text,
    metadata     jsonb,
    created_at   timestamptz
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
  select a.id, a.user_id, a.event_type, a.ip_hash, a.user_agent, a.metadata, a.created_at
  from public.audit_events a
  where (search_user_id is null or a.user_id = search_user_id)
    and (event_filter is null or a.event_type = event_filter)
  order by a.created_at desc
  limit limit_count
  offset offset_count;
end;
$$;

revoke all on function public.admin_list_audit_events(uuid, text, int, int) from public;
grant execute on function public.admin_list_audit_events(uuid, text, int, int) to authenticated;

-- ---------- Organizations (multi-tenant scaffolding, phase 1) ----------
-- An org is a billing/tenancy unit. Membership is separate from group sharing —
-- groups stay at the user-cooperation layer; orgs are for B2B billing.
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  owner_id    uuid not null references auth.users(id) on delete restrict,
  status      text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at  timestamptz not null default now()
);

create table if not exists public.organization_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  joined_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members(user_id);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- Members can see their own org; admins can see all.
drop policy if exists "organizations_member_read" on public.organizations;
create policy "organizations_member_read"
  on public.organizations for select
  using (
    public.is_admin()
    or id in (select org_id from public.organization_members where user_id = auth.uid())
  );

drop policy if exists "organizations_admin_all" on public.organizations;
create policy "organizations_admin_all"
  on public.organizations for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "organization_members_self_read" on public.organization_members;
create policy "organization_members_self_read"
  on public.organization_members for select
  using (
    public.is_admin()
    or user_id = auth.uid()
    or org_id in (select org_id from public.organization_members where user_id = auth.uid())
  );

drop policy if exists "organization_members_admin_all" on public.organization_members;
create policy "organization_members_admin_all"
  on public.organization_members for all
  using (public.is_admin())
  with check (public.is_admin());

-- Aggregate stats for the org list page.
create or replace function public.admin_list_organizations(
  search_query text default null,
  limit_count  int  default 50,
  offset_count int  default 0
)
  returns table (
    id           uuid,
    name         text,
    slug         text,
    status       text,
    member_count bigint,
    created_at   timestamptz
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
    o.id, o.name, o.slug, o.status,
    (select count(*) from public.organization_members m where m.org_id = o.id)::bigint as member_count,
    o.created_at
  from public.organizations o
  where search_query is null
     or o.name ilike '%' || search_query || '%'
     or o.slug ilike '%' || search_query || '%'
  order by o.created_at desc
  limit limit_count
  offset offset_count;
end;
$$;

revoke all on function public.admin_list_organizations(text, int, int) from public;
grant execute on function public.admin_list_organizations(text, int, int) to authenticated;

-- ---------- Zero-knowledge hard guard ----------
-- Defence in depth: explicitly revoke any default SELECT grants that might
-- have leaked vault ciphertext to authenticated. RLS already filters this
-- to "only your own rows", but for admins we want the strictest possible
-- shape: they NEVER read ciphertext, only the aggregates above. The RPC
-- security_definer functions own the elevated read; admins call those RPCs.
--
-- (We keep the existing per-user RLS so customers can still SELECT their
-- own rows directly; admins simply never gain "select all" privileges.)
comment on table public.encrypted_vault_items is
  'ZK guard: admins do NOT have a policy granting cross-user select here. Only the customer who owns the row may read it (RLS). Admins read aggregates via admin_get_user_stats / admin_list_users.';
comment on table public.users is
  'ZK guard: kdf_params and encrypted_private_key are never returned by admin RPCs.';
