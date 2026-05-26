-- 0002_users.sql
-- Design Ref: §3.1 / §3.3 — public.users mirrors auth.users (1:1).
-- Stores KDF params (non-secret) and the user's ECDH public key.
-- The user's private ECDH key is stored encrypted by the vault key — never plaintext on the server.

create table if not exists public.users (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text not null unique,

  -- KDF params (Argon2id m=64MB / t=3 / p=4 per Design §7.3).
  -- saltAuth/saltVault are both stored — alone they reveal nothing about the master password.
  kdf_params             jsonb not null,

  -- Recipient public key for 1:1 and group sharing (ECDH P-256, uncompressed, base64).
  public_key             text not null,

  -- Private ECDH key, AES-GCM-wrapped with vaultKey. Server only sees ciphertext.
  encrypted_private_key  jsonb not null,

  recovery_enabled       boolean not null default false,
  created_at             timestamptz not null default now()
);

comment on table  public.users is 'Per-user crypto profile. No plaintext credentials. Aligns 1:1 with auth.users.';
comment on column public.users.kdf_params is 'JSON: {algorithm:"argon2id", memoryCost, timeCost, parallelism, saltAuth, saltVault}';
comment on column public.users.encrypted_private_key is 'AES-256-GCM wrapped ECDH private key. JSON: {ciphertext, iv, authTag} (base64).';

alter table public.users enable row level security;

-- A user can read only their own row.
drop policy if exists "users_self_read" on public.users;
create policy "users_self_read"
  on public.users for select
  using (auth.uid() = id);

-- A user can update their own row (used by master password rotation flow).
drop policy if exists "users_self_update" on public.users;
create policy "users_self_update"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- A user can insert their own row exactly once at signup (id must equal auth.uid()).
drop policy if exists "users_self_insert" on public.users;
create policy "users_self_insert"
  on public.users for insert
  with check (auth.uid() = id);

-- Reading the public_key of OTHER users is required for sharing. Expose ONLY id+email+public_key.
-- We do this via a view; the underlying table never grants public select.
create or replace view public.user_directory as
  select id, email, public_key
  from public.users;

comment on view public.user_directory is 'Lookup table for sharing flows. Authenticated users may read id+email+publicKey of other users.';

-- Grant select on the view to authenticated users (Supabase requires explicit grant).
grant select on public.user_directory to authenticated;
