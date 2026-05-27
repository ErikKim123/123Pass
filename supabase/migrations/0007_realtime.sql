-- 0007_realtime.sql
-- Design Ref: §2.2 / §3.3 — Supabase Realtime subscribes to publications.
-- Only vault tables broadcast change events to authenticated clients.
-- RLS still applies to the published rows — clients receive only the rows they can read.
--
-- ALTER PUBLICATION ... DROP TABLE does NOT support `IF EXISTS` in PostgreSQL (verified
-- against PG 15/16). For idempotency we wrap each DROP in a DO block that catches
-- undefined_object, then unconditionally re-add the tables.

do $$ begin
  alter publication supabase_realtime drop table public.encrypted_vault_items;
exception when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime drop table public.group_items;
exception when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime drop table public.shared_items;
exception when undefined_object then null;
end $$;

alter publication supabase_realtime add table public.encrypted_vault_items;
alter publication supabase_realtime add table public.group_items;
alter publication supabase_realtime add table public.shared_items;
