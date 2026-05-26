-- 0003_vault.sql
-- Design Ref: §3.1 / §3.3 — folders + encrypted_vault_items.
-- INVARIANT: every column that could leak credential data is encrypted (ciphertext/iv/authTag).
-- Server-readable metadata is limited to itemType (for filtering), searchHash (HMAC), and timestamps.

create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,

  -- Folder name is also encrypted to avoid leaking user organization patterns.
  ciphertext  text not null,
  iv          text not null,
  auth_tag    text not null,

  created_at  timestamptz not null default now()
);

create index if not exists folders_user_idx on public.folders(user_id);

alter table public.folders enable row level security;

drop policy if exists "folders_owner_all" on public.folders;
create policy "folders_owner_all"
  on public.folders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table if not exists public.encrypted_vault_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,

  -- AES-256-GCM ciphertext, IV (12 bytes), authTag (16 bytes) — all base64.
  ciphertext   text not null,
  iv           text not null,
  auth_tag     text not null,

  -- itemType is needed for sidebar filtering. It does NOT reveal credential content.
  item_type    text not null check (item_type in ('login','note','card','identity','totp')),

  -- Deterministic HMAC over normalized url/name. Null = not searchable.
  search_hash  text,

  folder_id    uuid references public.folders(id) on delete set null,
  favorite     boolean not null default false,

  -- Monotonic version counter — vault-sdk uses it for last-writer-wins conflict resolution.
  version      bigint not null default 1,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists vault_user_updated_idx
  on public.encrypted_vault_items(user_id, updated_at desc);
create index if not exists vault_user_search_idx
  on public.encrypted_vault_items(user_id, search_hash)
  where search_hash is not null;
create index if not exists vault_user_favorite_idx
  on public.encrypted_vault_items(user_id, favorite)
  where favorite = true;

alter table public.encrypted_vault_items enable row level security;

-- Owner-only access. Sharing is handled in 0004_sharing.sql via a separate table.
drop policy if exists "vault_owner_all" on public.encrypted_vault_items;
create policy "vault_owner_all"
  on public.encrypted_vault_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-bump updated_at on update.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vault_touch_updated_at on public.encrypted_vault_items;
create trigger vault_touch_updated_at
  before update on public.encrypted_vault_items
  for each row execute function public.touch_updated_at();
