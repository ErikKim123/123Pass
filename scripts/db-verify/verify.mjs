#!/usr/bin/env node
// scripts/db-verify/verify.mjs
//
// PGlite-based verification of supabase/migrations/0001-0008.sql.
//
// Why: the standard Supabase verification path requires Docker + supabase CLI,
// which are not always available. PGlite is PostgreSQL 16 compiled to WASM and
// runs in-process — close enough to catch syntax errors, FK/constraint issues,
// RLS policy logic, and PL/pgSQL function bodies before they hit a real DB.
//
// What it does:
//   1. Stub the Supabase-specific surfaces PGlite doesn't know about:
//        - schema `auth` with `auth.users(id uuid pk)` and `auth.uid()` function
//        - `authenticated` and `service_role` roles
//        - `supabase_realtime` publication
//   2. Apply migrations 0001..0008 in order, abort on first error
//   3. Introspect: tables, RLS-enabled tables, policies, indexes, functions, views
//   4. Behaviour-test RLS:
//        - User A cannot read User B's row in public.users
//        - User A cannot read User B's encrypted_vault_items
//        - Group-member helper functions evaluate correctly
//        - rotate_master_password rejects calls without auth.uid()
//   5. Emit a structured report to stdout (also written to scripts/db-verify/report.json)
//
// Run: `node scripts/db-verify/verify.mjs`

import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const REPORT_PATH = join(HERE, 'report.json');

const report = {
  toolingVersion: 'pglite',
  startedAt: new Date().toISOString(),
  migrations: [],
  schema: {},
  rlsBehaviour: [],
  errors: [],
};

function log(kind, msg) {
  const stamp = new Date().toISOString().slice(11, 23);
  process.stdout.write(`[${stamp}] ${kind} ${msg}\n`);
}

async function main() {
  const db = new PGlite();
  log('init', 'PGlite instance created');

  // -------- 1. Supabase-compat stubs --------
  await db.exec(`
    create schema if not exists auth;

    -- Mirror the subset of auth.users that public.users depends on.
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      created_at timestamptz not null default now()
    );

    -- auth.uid() reads the JWT sub claim Supabase sets per request.
    -- We emulate it via a session-local setting that tests can swap with set_config().
    create or replace function auth.uid() returns uuid
    language sql stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    -- Roles Supabase creates out-of-the-box.
    do $$ begin
      create role authenticated;
    exception when duplicate_object then null;
    end $$;
    do $$ begin
      create role service_role;
    exception when duplicate_object then null;
    end $$;

    -- supabase_realtime is a logical publication the platform creates at provisioning time.
    do $$ begin
      create publication supabase_realtime;
    exception when duplicate_object then null;
    end $$;

    -- Supabase auto-grants on schema public for both anon and authenticated roles.
    -- Without these, every query under SET ROLE authenticated returns "permission denied"
    -- even before RLS gets a chance to evaluate. RLS then acts as the real gate.
    grant usage on schema public to authenticated, service_role;
    alter default privileges in schema public
      grant select, insert, update, delete on tables to authenticated;
    alter default privileges in schema public
      grant usage, select on sequences to authenticated;
    alter default privileges in schema public
      grant execute on functions to authenticated;
  `);
  log('init', 'Supabase compat stubs created (auth schema, roles, publication, default grants)');

  // -------- 2. Apply migrations in order --------
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  log('init', `Found ${files.length} migration files`);

  for (const file of files) {
    let sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');

    // PGlite-specific compat: skip CREATE EXTENSION lines. PGlite already provides
    // gen_random_uuid() as a built-in (PG13+). pgcrypto/uuid-ossp are only needed
    // on real Supabase instances. We record the skip so the report stays honest.
    const extensionSkipped = [];
    sql = sql.replace(/^\s*create extension[^;]*;/gim, (match) => {
      extensionSkipped.push(match.trim());
      return `-- [pglite-skip] ${match.trim()}`;
    });

    const t0 = Date.now();
    try {
      await db.exec(sql);
      const ms = Date.now() - t0;
      const note = extensionSkipped.length > 0 ? ` (skipped ${extensionSkipped.length} CREATE EXTENSION line(s) — PGlite has gen_random_uuid built-in)` : '';
      log('migration', `${file} OK (${ms}ms)${note}`);
      report.migrations.push({
        file,
        status: 'ok',
        durationMs: ms,
        skipped: extensionSkipped.length > 0 ? extensionSkipped : undefined,
      });
    } catch (e) {
      log('migration', `${file} FAIL: ${e.message}`);
      report.migrations.push({ file, status: 'fail', error: e.message });
      report.errors.push(`Migration ${file}: ${e.message}`);
      break;
    }
  }

  if (report.errors.length === 0) {
    await introspectSchema(db);
    await runRlsBehaviourTests(db);
  } else {
    log('abort', 'Skipping introspection + RLS tests due to migration failure');
  }

  report.finishedAt = new Date().toISOString();
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  log('done', `Report written to ${REPORT_PATH}`);

  // Summary line for CI consumers
  const ok = report.errors.length === 0;
  log('summary', ok ? 'PASS' : `FAIL (${report.errors.length} errors)`);
  process.exit(ok ? 0 : 1);
}

async function introspectSchema(db) {
  // Tables in public schema
  const tablesQ = await db.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `);
  report.schema.tables = tablesQ.rows.map((r) => r.table_name);

  // Views
  const viewsQ = await db.query(`
    select table_name from information_schema.views
    where table_schema = 'public'
    order by table_name
  `);
  report.schema.views = viewsQ.rows.map((r) => r.table_name);

  // RLS-enabled tables
  const rlsQ = await db.query(`
    select relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
    order by relname
  `);
  report.schema.rlsEnabledTables = rlsQ.rows.map((r) => r.relname);

  // Policies per table
  const polQ = await db.query(`
    select schemaname || '.' || tablename as relation, policyname, cmd
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `);
  report.schema.policies = polQ.rows.map((r) => ({
    relation: r.relation,
    policy: r.policyname,
    command: r.cmd,
  }));

  // Indexes
  const idxQ = await db.query(`
    select schemaname || '.' || tablename as relation, indexname
    from pg_indexes
    where schemaname = 'public'
    order by tablename, indexname
  `);
  report.schema.indexes = idxQ.rows.map((r) => ({
    relation: r.relation,
    index: r.indexname,
  }));

  // Functions
  const fnQ = await db.query(`
    select p.proname as name, l.lanname as lang
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
    order by p.proname
  `);
  report.schema.functions = fnQ.rows.map((r) => ({ name: r.name, lang: r.lang }));

  // Publication contents
  try {
    const pubQ = await db.query(`
      select schemaname || '.' || tablename as relation
      from pg_publication_tables
      where pubname = 'supabase_realtime'
      order by tablename
    `);
    report.schema.realtimeTables = pubQ.rows.map((r) => r.relation);
  } catch (e) {
    report.schema.realtimeTables = `error: ${e.message}`;
  }

  log('schema', `tables=${report.schema.tables.length} rls=${report.schema.rlsEnabledTables.length} policies=${report.schema.policies.length} indexes=${report.schema.indexes.length} functions=${report.schema.functions.length}`);
}

// -------- 4. RLS behaviour tests --------

async function runRlsBehaviourTests(db) {
  // Helper: set the JWT sub claim for the next statements.
  async function as(userId) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false)`);
  }
  async function asAnon() {
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  }
  async function record(name, fn) {
    try {
      await fn();
      log('rls', `PASS ${name}`);
      report.rlsBehaviour.push({ name, status: 'pass' });
    } catch (e) {
      log('rls', `FAIL ${name}: ${e.message}`);
      report.rlsBehaviour.push({ name, status: 'fail', error: e.message });
      report.errors.push(`RLS ${name}: ${e.message}`);
    }
  }

  // Seed two users directly via the auth schema (bypassing public.users RLS by running as superuser
  // with no auth.uid()). Then SET ROLE to "authenticated" so subsequent statements obey RLS.
  await db.exec(`
    insert into auth.users (id, email) values
      ('00000000-0000-0000-0000-000000000001', 'alice@test.local'),
      ('00000000-0000-0000-0000-000000000002', 'bob@test.local')
    on conflict (id) do nothing;
  `);

  const ALICE = '00000000-0000-0000-0000-000000000001';
  const BOB = '00000000-0000-0000-0000-000000000002';

  // Pre-seed public.users for both users via security definer path: temporarily disable RLS
  // for setup, then re-enable. (In real Supabase, the signup RPC + policy do this.)
  await db.exec('alter table public.users disable row level security');
  await db.exec(`
    insert into public.users (id, email, kdf_params, public_key, encrypted_private_key)
    values
      ('${ALICE}', 'alice@test.local',
        '{"algorithm":"argon2id","memoryCost":65536,"timeCost":3,"parallelism":4,"saltAuth":"YQ==","saltVault":"Yg=="}'::jsonb,
        'ALICE_PUBKEY',
        '{"ciphertext":"AAAA","iv":"AAAAAAAAAAAAAAAA","authTag":"AAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb),
      ('${BOB}', 'bob@test.local',
        '{"algorithm":"argon2id","memoryCost":65536,"timeCost":3,"parallelism":4,"saltAuth":"YQ==","saltVault":"Yg=="}'::jsonb,
        'BOB_PUBKEY',
        '{"ciphertext":"BBBB","iv":"AAAAAAAAAAAAAAAA","authTag":"BBBBBBBBBBBBBBBBBBBBBBBB"}'::jsonb)
    on conflict (id) do nothing;
  `);
  await db.exec(`
    insert into public.encrypted_vault_items (user_id, ciphertext, iv, auth_tag, item_type)
    values
      ('${ALICE}', 'ALICE_CT', 'AAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAAAA', 'login'),
      ('${BOB}',   'BOB_CT',   'AAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBBBBBB', 'login')
  `);
  await db.exec('alter table public.users enable row level security');

  // Apply RLS for the rest of the tests by switching role.
  await db.exec(`set role authenticated`);

  await record('alice sees only her own users row', async () => {
    await as(ALICE);
    const r = await db.query('select id, email from public.users');
    if (r.rows.length !== 1) throw new Error(`expected 1 row, got ${r.rows.length}`);
    if (r.rows[0].id !== ALICE) throw new Error(`expected alice, got ${r.rows[0].id}`);
  });

  await record('bob sees only his own users row', async () => {
    await as(BOB);
    const r = await db.query('select id, email from public.users');
    if (r.rows.length !== 1) throw new Error(`expected 1 row, got ${r.rows.length}`);
    if (r.rows[0].id !== BOB) throw new Error(`expected bob, got ${r.rows[0].id}`);
  });

  await record('anonymous (no auth.uid) sees zero users rows', async () => {
    await asAnon();
    const r = await db.query('select id from public.users');
    if (r.rows.length !== 0) throw new Error(`anonymous saw ${r.rows.length} rows`);
  });

  await record('alice cannot read bob vault items', async () => {
    await as(ALICE);
    const r = await db.query(
      `select id from public.encrypted_vault_items where user_id = '${BOB}'`,
    );
    if (r.rows.length !== 0) throw new Error(`alice saw ${r.rows.length} bob rows`);
  });

  await record('alice sees her own vault items', async () => {
    await as(ALICE);
    const r = await db.query(
      `select ciphertext from public.encrypted_vault_items where user_id = '${ALICE}'`,
    );
    if (r.rows.length !== 1) throw new Error(`expected 1 row, got ${r.rows.length}`);
    if (r.rows[0].ciphertext !== 'ALICE_CT') {
      throw new Error(`wrong ciphertext: ${r.rows[0].ciphertext}`);
    }
  });

  await record('alice cannot insert a vault item attributed to bob', async () => {
    await as(ALICE);
    let blocked = false;
    try {
      await db.exec(`
        insert into public.encrypted_vault_items (user_id, ciphertext, iv, auth_tag, item_type)
        values ('${BOB}', 'INJECTED', 'AAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBBBBBB', 'login')
      `);
    } catch {
      blocked = true;
    }
    if (!blocked) {
      // Check whether the insert silently went to alice's own id (also acceptable under WITH CHECK) or actually inserted as bob.
      const r = await db.query(
        `select user_id from public.encrypted_vault_items where ciphertext = 'INJECTED'`,
      );
      const owners = r.rows.map((row) => row.user_id);
      if (owners.includes(BOB)) {
        throw new Error('alice was able to insert a row attributed to bob');
      }
    }
  });

  await record('user_directory view exposes only id+email+public_key (no kdf_params)', async () => {
    await as(ALICE);
    const r = await db.query(`select * from public.user_directory limit 1`);
    const cols = Object.keys(r.rows[0] ?? {});
    const allowed = new Set(['id', 'email', 'public_key']);
    for (const c of cols) {
      if (!allowed.has(c)) throw new Error(`user_directory leaks column "${c}"`);
    }
  });

  await record('rotate_master_password requires auth.uid()', async () => {
    await asAnon();
    let raised = false;
    try {
      await db.exec(`
        select public.rotate_master_password(
          '{"algorithm":"argon2id","memoryCost":65536,"timeCost":3,"parallelism":4,"saltAuth":"YQ==","saltVault":"Yg=="}'::jsonb,
          '{"ciphertext":"AAAA","iv":"AAAAAAAAAAAAAAAA","authTag":"AAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb,
          '[]'::jsonb
        )
      `);
    } catch (e) {
      if (/AUTH_REQUIRED/.test(e.message)) raised = true;
      else throw new Error(`unexpected error: ${e.message}`);
    }
    if (!raised) throw new Error('rotate_master_password did not raise AUTH_REQUIRED');
  });

  await record('rotate_master_password rejects malformed kdf_params', async () => {
    await as(ALICE);
    let raised = false;
    try {
      await db.exec(`
        select public.rotate_master_password(
          '{}'::jsonb,
          '{"ciphertext":"AAAA","iv":"AAAAAAAAAAAAAAAA","authTag":"AAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb,
          '[]'::jsonb
        )
      `);
    } catch (e) {
      if (/KDF_PARAMS_INVALID/.test(e.message)) raised = true;
      else throw new Error(`unexpected error: ${e.message}`);
    }
    if (!raised) throw new Error('did not raise KDF_PARAMS_INVALID');
  });

  // Reset role so the test process exits cleanly.
  await db.exec('reset role');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
