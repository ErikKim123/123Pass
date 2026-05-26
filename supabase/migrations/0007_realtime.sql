-- 0007_realtime.sql
-- Design Ref: §2.2 / §3.3 — Supabase Realtime subscribes to publications.
-- Only vault tables broadcast change events to authenticated clients.
-- RLS still applies to the published rows — clients receive only the rows they can read.

-- Idempotent: drop and re-add the tables to the publication.
alter publication supabase_realtime drop table if exists public.encrypted_vault_items;
alter publication supabase_realtime drop table if exists public.group_items;
alter publication supabase_realtime drop table if exists public.shared_items;

alter publication supabase_realtime add table public.encrypted_vault_items;
alter publication supabase_realtime add table public.group_items;
alter publication supabase_realtime add table public.shared_items;
