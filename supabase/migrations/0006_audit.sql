-- 0006_audit.sql
-- Design Ref: §3.1 / §7.2 — audit events store metadata only. Never plaintext credentials.

create table if not exists public.audit_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,

  event_type  text not null check (event_type in (
    'login', 'login_failed',
    'item_created', 'item_updated', 'item_deleted',
    'share_created', 'share_accepted',
    'master_pw_changed', 'recovery_used'
  )),

  ip_hash     text,                 -- hashed IP for privacy (HMAC by server-side salt)
  user_agent  text,
  metadata    jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now()
);

create index if not exists audit_user_time_idx
  on public.audit_events(user_id, created_at desc);

alter table public.audit_events enable row level security;

-- A user can read only their own audit log.
drop policy if exists "audit_self_read" on public.audit_events;
create policy "audit_self_read"
  on public.audit_events for select
  using (auth.uid() = user_id);

-- A user can append events about themselves. Service role can append on behalf (e.g., login failed).
drop policy if exists "audit_self_insert" on public.audit_events;
create policy "audit_self_insert"
  on public.audit_events for insert
  with check (auth.uid() = user_id);
