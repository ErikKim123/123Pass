-- 0005_groups.sql
-- Design Ref: §3.1 / §FR-12 — family/team sharing.
-- A group has ONE symmetric group key. Each member receives that key wrapped under their public key.

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                          -- group name is plaintext (organizational, not credential)
  owner_id    uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists groups_owner_idx on public.groups(owner_id);

alter table public.groups enable row level security;


create table if not exists public.group_members (
  group_id          uuid not null references public.groups(id) on delete cascade,
  user_id           uuid not null references public.users(id) on delete cascade,

  role              text not null check (role in ('owner','admin','member')),

  -- Wrapped group symmetric key — only this member can unwrap.
  wrapped_group_key jsonb not null,

  joined_at         timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members(user_id);

alter table public.group_members enable row level security;


create table if not exists public.group_items (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,

  ciphertext  text not null,
  iv          text not null,
  auth_tag    text not null,

  item_type   text not null check (item_type in ('login','note','card','identity','totp')),
  created_by  uuid not null references public.users(id),

  version     bigint not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists group_items_group_updated_idx
  on public.group_items(group_id, updated_at desc);

alter table public.group_items enable row level security;

drop trigger if exists group_items_touch_updated_at on public.group_items;
create trigger group_items_touch_updated_at
  before update on public.group_items
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- Helper predicate: is the current auth.uid() a member of the given group?
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable
security invoker
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = gid and gm.user_id = auth.uid()
  );
$$;

-- Helper predicate: is the current auth.uid() owner OR admin of the given group?
create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql stable
security invoker
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = gid
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
  );
$$;

-- groups: only members can read; only the owner can update name/delete.
drop policy if exists "groups_member_read" on public.groups;
create policy "groups_member_read"
  on public.groups for select
  using (public.is_group_member(id));

drop policy if exists "groups_owner_insert" on public.groups;
create policy "groups_owner_insert"
  on public.groups for insert
  with check (auth.uid() = owner_id);

drop policy if exists "groups_owner_update" on public.groups;
create policy "groups_owner_update"
  on public.groups for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "groups_owner_delete" on public.groups;
create policy "groups_owner_delete"
  on public.groups for delete
  using (auth.uid() = owner_id);

-- group_members: members can see their own membership rows; admins can manage.
drop policy if exists "group_members_self_read" on public.group_members;
create policy "group_members_self_read"
  on public.group_members for select
  using (
    auth.uid() = user_id
    or public.is_group_admin(group_id)
  );

drop policy if exists "group_members_admin_insert" on public.group_members;
create policy "group_members_admin_insert"
  on public.group_members for insert
  with check (
    -- Owner can seed themselves at group creation time, OR an existing admin invites someone.
    auth.uid() = user_id
    or public.is_group_admin(group_id)
  );

drop policy if exists "group_members_admin_delete" on public.group_members;
create policy "group_members_admin_delete"
  on public.group_members for delete
  using (
    auth.uid() = user_id          -- members can leave
    or public.is_group_admin(group_id)
  );

-- group_items: any group member can read/write items (write permission tied to group membership, not per-item).
drop policy if exists "group_items_member_all" on public.group_items;
create policy "group_items_member_all"
  on public.group_items for all
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));
