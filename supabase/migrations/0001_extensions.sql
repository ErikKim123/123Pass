-- 0001_extensions.sql
-- Enable required PostgreSQL extensions.
-- Design Ref: §3.3 — gen_random_uuid is the default uuid generator on all primary keys.

create extension if not exists "pgcrypto";  -- gen_random_uuid, digest, hmac (for future server-side hashing if needed)
create extension if not exists "uuid-ossp"; -- optional, kept as fallback for legacy clients
