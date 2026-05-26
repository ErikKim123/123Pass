-- 0004_sharing.sql
-- Design Ref: §3.1 / §FR-11 — 1:1 sharing via ECDH-wrapped vault keys.
-- The recipient's public key wraps the item's symmetric key; only the recipient can unwrap.

create table if not exists public.shared_items (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.encrypted_vault_items(id) on delete cascade,
  from_user_id  uuid not null references public.users(id) on delete cascade,
  to_user_id    uuid not null references public.users(id) on delete cascade,

  -- Wrapped key: {ciphertext, iv, ephemeralPublicKey} (all base64).
  wrapped_key   jsonb not null,

  permission    text not null check (permission in ('read','write')),

  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),

  -- A given item shared from A to B should exist at most once.
  unique (item_id, to_user_id)
);

create index if not exists shared_items_to_user_idx
  on public.shared_items(to_user_id, created_at desc);
create index if not exists shared_items_from_user_idx
  on public.shared_items(from_user_id, created_at desc);

alter table public.shared_items enable row level security;

-- Both sender and recipient can read the share row (to see history / pending requests).
drop policy if exists "shared_items_participant_read" on public.shared_items;
create policy "shared_items_participant_read"
  on public.shared_items for select
  using (auth.uid() in (from_user_id, to_user_id));

-- Only the sender can create a share, and only for items they own.
drop policy if exists "shared_items_sender_insert" on public.shared_items;
create policy "shared_items_sender_insert"
  on public.shared_items for insert
  with check (
    auth.uid() = from_user_id
    and exists (
      select 1 from public.encrypted_vault_items
      where id = item_id and user_id = auth.uid()
    )
  );

-- Recipient can update the row to mark it accepted.
drop policy if exists "shared_items_recipient_accept" on public.shared_items;
create policy "shared_items_recipient_accept"
  on public.shared_items for update
  using (auth.uid() = to_user_id)
  with check (auth.uid() = to_user_id);

-- Sender can revoke (delete) the share.
drop policy if exists "shared_items_sender_delete" on public.shared_items;
create policy "shared_items_sender_delete"
  on public.shared_items for delete
  using (auth.uid() = from_user_id);
