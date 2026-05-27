# DB Verify (DB2 — RUNTIME-01 partial)

PGlite-based runtime verification of `supabase/migrations/0001-0008.sql`.

## Why

The standard verification path (`supabase start` → `supabase db reset`) requires
Docker Desktop + the Supabase CLI. On machines without those, this script gives
a real-PostgreSQL execution environment via [PGlite](https://pglite.dev/)
(PostgreSQL 16 compiled to WASM) so that:

- Migration SQL syntax is parsed by a real PostgreSQL grammar.
- Foreign keys, constraints, indexes, and triggers are actually created.
- RLS policies are evaluated against synthetic users.
- PL/pgSQL function bodies (e.g. `rotate_master_password`) are executed.

## Run

```bash
pnpm db:verify
```

Produces `scripts/db-verify/report.json` and exits with code 0 on success,
non-zero on failure.

## What it does

1. **Supabase compat stubs** — creates the surfaces PGlite doesn't ship with:
   - `auth` schema with `auth.users(id, email)` and `auth.uid()` (reads JWT
     sub claim from a session-local setting).
   - `authenticated` and `service_role` roles.
   - `supabase_realtime` logical publication.
   - Default privileges on schema `public` that Supabase applies automatically
     in real deployments.

2. **Migration runner** — applies `0001..0008.sql` in lexical order, aborts on
   first error.
   - `CREATE EXTENSION pgcrypto / "uuid-ossp"` lines are skipped — PGlite
     provides `gen_random_uuid()` as a PG13+ built-in, and these extensions
     aren't shipped. The skip is recorded in the report under `migrations[i].skipped`.

3. **Schema introspection** — queries `pg_class`, `pg_policies`, `pg_indexes`,
   `pg_proc`, `pg_publication_tables`, `information_schema.tables/views` and
   writes the results to the report.

4. **RLS behaviour tests** — switches role to `authenticated`, swaps
   `auth.uid()` via session config, and verifies:
   - Alice/Bob each see only their own `public.users` row.
   - Anonymous sessions see zero rows.
   - Cross-user vault item reads return zero rows.
   - Owner can read their own vault items.
   - Cross-user inserts are blocked (RLS WITH CHECK).
   - `user_directory` view exposes only `id + email + public_key`
     (no `kdf_params` leak).
   - `rotate_master_password` raises `AUTH_REQUIRED` without a session.
   - `rotate_master_password` raises `KDF_PARAMS_INVALID` for malformed input.

## What it does NOT cover

- Supabase Auth flows (signup/login JWTs, email confirmation).
- Storage policies, edge functions, vault extension.
- Logical replication actually broadcasting (PGlite is a single instance).
- Live PostgreSQL extensions (pgcrypto's `digest`/`hmac` — we don't use them
  beyond `gen_random_uuid` which is PG-built-in).

For full verification, run the standard `supabase start` flow once the
CLI is available.

## Findings from the first run (2026-05-27)

- ✅ All 8 migrations apply cleanly (after fixing 0007 — see below).
- ✅ 8 tables, 8 RLS-enabled, 19 policies, 20 indexes, 4 functions, 1 view,
  3 realtime publication entries.
- ✅ 9/9 RLS behaviour assertions pass.
- 🐛 **Bug found**: `0007_realtime.sql` used `ALTER PUBLICATION ... DROP TABLE IF EXISTS`,
  which is not valid PostgreSQL syntax (verified against PG 15/16 docs). Fixed
  by wrapping each DROP in a `DO $$ ... exception when undefined_object` block.
