// SupabaseRepository smoke test — verifies the adapter instantiates against a
// dummy Supabase client and exposes the full VaultRepository contract. Live
// query behaviour is verified separately via `pnpm db:verify` (PGlite) and the
// future Docker-based integration tests.

import { describe, expect, it, vi } from 'vitest';

import { SupabaseRepository, type VaultRepository } from '../src';
import type { TypedSupabaseClient } from '../src/infrastructure/supabase-client';

// Build the minimum chained-builder shape postgrest-js uses, returning a
// pre-set response. Vitest's `vi.fn()` is enough — no network, no DB.
function buildFakeQueryBuilder(response: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const chain = ['select', 'insert', 'update', 'delete', 'eq', 'gt', 'order', 'limit'];
  for (const m of chain) builder[m] = vi.fn(() => builder);
  builder.single = vi.fn(async () => response);
  builder.maybeSingle = vi.fn(async () => response);
  // Allow `await builder` directly (listItems uses this).
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(response);
  return builder;
}

function makeFakeClient(): TypedSupabaseClient {
  const noopBuilder = buildFakeQueryBuilder({ data: null, error: null });
  const fake = {
    auth: {
      signUp: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
    },
    from: vi.fn(() => noopBuilder),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    channel: vi.fn(() => ({
      on: vi.fn(function on(this: unknown) {
        return this;
      }),
      subscribe: vi.fn(function subscribe(this: unknown) {
        return this;
      }),
    })),
    removeChannel: vi.fn(),
  };
  return fake as unknown as TypedSupabaseClient;
}

describe('SupabaseRepository — interface conformance', () => {
  it('instantiates and exposes every VaultRepository method', () => {
    const repo: VaultRepository = new SupabaseRepository(makeFakeClient());
    // Type-level conformance is checked by the `: VaultRepository` annotation;
    // here we double-check at runtime that the expected method names exist.
    const expected = [
      'signUp', 'signIn', 'signOut', 'currentUserId',
      'createUserRecord', 'getUserRecord', 'getUserDirectoryEntry',
      'insertItem', 'updateItem', 'deleteItem', 'listItems', 'getItem',
      'insertShare', 'listIncomingShares', 'acceptShare', 'deleteShare',
      'createGroup', 'listGroups', 'getGroup', 'getGroupMember',
      'listGroupMembers', 'inviteGroupMember', 'removeGroupMember',
      'insertGroupItem', 'listGroupItems', 'deleteGroupItem',
      'rotateMasterPassword', 'subscribeItems',
    ];
    for (const name of expected) {
      expect(typeof (repo as unknown as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('signUp forwards email + authHash to supabase.auth.signUp', async () => {
    const client = makeFakeClient();
    const repo = new SupabaseRepository(client);
    const result = await repo.signUp('a@test', 'derived-auth-hash-base64');
    expect(result.userId).toBe('u1');
    // @ts-expect-error — we're inspecting the spy on the fake.
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'a@test',
      password: 'derived-auth-hash-base64',
    });
  });

  it('signIn surfaces AUTH_INVALID_CREDENTIALS on Supabase auth error', async () => {
    const fake = makeFakeClient() as unknown as {
      auth: { signInWithPassword: ReturnType<typeof vi.fn> };
    };
    fake.auth.signInWithPassword = vi.fn(async () => ({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    }));
    const repo = new SupabaseRepository(fake as unknown as TypedSupabaseClient);
    await expect(repo.signIn('a@test', 'wrong-hash')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
  });

  it('rotateMasterPassword invokes the rotate_master_password RPC', async () => {
    const client = makeFakeClient();
    const repo = new SupabaseRepository(client);
    await repo.rotateMasterPassword({
      newKdfParams: {
        algorithm: 'argon2id',
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
        saltAuth: 'YQ==',
        saltVault: 'Yg==',
      },
      newEncryptedPrivateKey: { ciphertext: 'a', iv: 'b', authTag: 'c' },
      newItems: [],
    });
    // @ts-expect-error — inspect spy on fake
    expect(client.rpc).toHaveBeenCalledWith('rotate_master_password', expect.any(Object));
  });
});
