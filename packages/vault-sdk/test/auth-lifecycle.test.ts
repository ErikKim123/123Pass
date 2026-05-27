// DB4 — auth lifecycle tests for the repository onAuthStateChange contract and
// VaultClient.signOutFully(). Exercised against InMemoryRepository; the
// SupabaseRepository smoke test in supabase-repository.test.ts verifies the
// shape of the equivalent call against a fake @supabase/supabase-js client.

import { describe, expect, it } from 'vitest';

import { createVaultClient, type AuthStateChange } from '../src';

import { InMemoryRepository } from './repository-mock';

const fastKdf = { memoryCost: 8192, timeCost: 1, parallelism: 1 } as const;

describe('FR-DB4 — repository.onAuthStateChange', () => {
  it('emits INITIAL_SESSION with null when no user is signed-in', async () => {
    const repo = new InMemoryRepository();
    const events: AuthStateChange[] = [];
    repo.onAuthStateChange((c) => events.push(c));
    await new Promise((r) => setTimeout(r, 5));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'INITIAL_SESSION', session: null });
  });

  it('emits SIGNED_IN with session on signUp, SIGNED_OUT on signOut', async () => {
    const repo = new InMemoryRepository();
    const events: AuthStateChange[] = [];
    const unsub = repo.onAuthStateChange((c) => events.push(c));
    await new Promise((r) => setTimeout(r, 5));

    await repo.signUp('alice@test', 'derived-auth-hash-base64');
    await repo.signOut();

    const types = events.map((e) => e.event);
    expect(types).toContain('INITIAL_SESSION');
    expect(types).toContain('SIGNED_IN');
    expect(types).toContain('SIGNED_OUT');
    const signedIn = events.find((e) => e.event === 'SIGNED_IN')!;
    expect(signedIn.session?.email).toBe('alice@test');
    const signedOut = events.find((e) => e.event === 'SIGNED_OUT')!;
    expect(signedOut.session).toBeNull();

    unsub();
  });

  it('currentSession returns null after signOut', async () => {
    const repo = new InMemoryRepository();
    await repo.signUp('bob@test', 'h');
    expect(await repo.currentSession()).toMatchObject({ email: 'bob@test' });
    await repo.signOut();
    expect(await repo.currentSession()).toBeNull();
  });

  it('unsubscribe stops further events', async () => {
    const repo = new InMemoryRepository();
    const events: AuthStateChange[] = [];
    const unsub = repo.onAuthStateChange((c) => events.push(c));
    await new Promise((r) => setTimeout(r, 5));
    unsub();
    await repo.signUp('carol@test', 'h');
    await new Promise((r) => setTimeout(r, 5));
    // Only the INITIAL_SESSION should be present — SIGNED_IN was unsubscribed before it fired.
    expect(events.filter((e) => e.event === 'SIGNED_IN')).toHaveLength(0);
  });
});

describe('FR-DB4 — VaultClient.signOutFully', () => {
  it('locks the vault and clears the repo session', async () => {
    const repo = new InMemoryRepository();
    const client = createVaultClient(repo);
    await client.signUp({
      email: 'd@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    expect(client.isUnlocked()).toBe(true);
    expect(await repo.currentUserId()).not.toBeNull();

    await client.signOutFully();

    expect(client.isUnlocked()).toBe(false);
    expect(await repo.currentUserId()).toBeNull();
  });

  it('is idempotent — calling signOutFully twice does not throw', async () => {
    const repo = new InMemoryRepository();
    const client = createVaultClient(repo);
    await client.signUp({
      email: 'e@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    await client.signOutFully();
    await expect(client.signOutFully()).resolves.toBeUndefined();
  });
});
