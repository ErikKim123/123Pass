# DB3 — Auto-generated Database types

PGlite-based generator that produces
`packages/vault-sdk/src/infrastructure/database.types.generated.ts` from
`supabase/migrations/*.sql`.

## Why

The standard `supabase gen types typescript` CLI requires a linked Supabase
project (cloud or local Docker). On dev machines without Docker we still need a
`Database` type that:

1. Mirrors the real Postgres column types per migration (so the type and the
   schema can't silently drift).
2. Satisfies `@supabase/postgrest-js`'s `GenericSchema` constraint — i.e. uses
   the wide `Json` shape for JSONB columns and includes `Relationships: []` on
   every table. The hand-written `database.types.ts` uses domain-friendly
   literal unions and structured JSONB shapes that strict TypeScript rejects
   for `Record<string, unknown>` matching, so the SDK needs a separate wire-
   format type.

The generator applies all migrations to an in-process PGlite instance and
introspects `information_schema` + `pg_proc` for the resulting schema.

## Commands

```bash
pnpm db:gen-types      # writes database.types.generated.ts
pnpm db:check-types    # exits non-zero on drift (use in CI)
```

## Wiring

- `supabase-client.ts` imports `Database` from the **generated** file. This is
  the type the SDK sees.
- `database.types.ts` (hand-written) keeps domain-friendly aliases (literal
  unions like `ItemType`, structured `KdfParams`) that downstream code prefers.
- `supabase-repository.ts` keeps the `this.db` cast (untyped client view) so
  reads can return the narrower domain Row types without per-call `as XxxRow`
  casts. The cast is contained to the adapter — call sites stay typed.

## Output style

Matches `supabase gen types typescript`:

- Top-level `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]`
- `Tables.<name>.Row` — every column required (`T | null` for nullable)
- `Tables.<name>.Insert` — columns with DB defaults or `NULL`-able become optional
- `Tables.<name>.Update` — every column optional
- `Tables.<name>.Relationships: []`
- `Views.<name>.Row` mirrors view columns
- `Functions.<name>.Args` + `Returns`
- `Enums` and `CompositeTypes` keyed by `[_ in never]`

## Limitations

- Foreign-key relationships are emitted as `Relationships: []` (the real
  `supabase gen types` reads `pg_constraint` and emits typed FK entries; we
  defer that until we adopt the official CLI).
- CHECK constraint values (e.g. `role IN ('owner','admin','member')`) don't
  appear in `information_schema`, so the generated types use bare `string` —
  the hand-written `database.types.ts` keeps the literal union for code that
  needs it.
- Composite types and enums are stubbed; the schema doesn't use any yet.
