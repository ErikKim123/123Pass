import { describe, expect, it } from 'vitest';

import { createVaultClient, VaultError, type VaultItemPayload } from '../src';

import { InMemoryRepository } from './repository-mock';

const fastKdf = { memoryCost: 8192, timeCost: 1, parallelism: 1 } as const;
const samplePayload: VaultItemPayload = {
  name: 'Gmail',
  url: 'https://mail.google.com',
  username: 'me@gmail.com',
  password: 'pw-1234567890',
};

describe('VaultClient lifecycle', () => {
  it('signUp creates a session and unlocks the vault', async () => {
    const client = createVaultClient(new InMemoryRepository());
    const sess = await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    expect(client.isUnlocked()).toBe(true);
    expect(sess.email).toBe('a@test');
    expect(sess.vaultKey.length).toBe(32);
    expect(sess.privateKey.length).toBe(32);
  });

  it('lock() wipes the vault key from memory', async () => {
    const client = createVaultClient(new InMemoryRepository());
    const sess = await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const sameRef = sess.vaultKey;
    client.lock();
    expect(client.isUnlocked()).toBe(false);
    expect(Array.from(sameRef).every((b) => b === 0)).toBe(true);
  });

  it('CRUD throws VAULT_LOCKED when not unlocked', () => {
    const client = createVaultClient(new InMemoryRepository());
    // currentSession() throws synchronously before list/create return a Promise.
    expect(() => client.list()).toThrow(VaultError);
    expect(() => client.list()).toThrow(/locked/i);
    expect(() => client.create(samplePayload, 'login')).toThrow(VaultError);
  });

  it('unlock with cached kdfParams restores access on a fresh client', async () => {
    const repo = new InMemoryRepository();

    const c1 = createVaultClient(repo);
    await c1.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const created = await c1.create(samplePayload, 'login');
    const kdfParams = (await repo.getUserRecord(c1.currentSession().userId))!.kdfParams;
    c1.lock();

    const c2 = createVaultClient(repo);
    await c2.unlock({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfParams,
    });
    const list = await c2.list();
    expect(list.map((i) => i.id)).toContain(created.id);
    expect(list.find((i) => i.id === created.id)?.payload.password).toBe('pw-1234567890');
  });

  it('unlock with wrong password rejects', async () => {
    const repo = new InMemoryRepository();
    const c1 = createVaultClient(repo);
    await c1.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const kdfParams = (await repo.getUserRecord(c1.currentSession().userId))!.kdfParams;
    c1.lock();

    const c2 = createVaultClient(repo);
    await expect(
      c2.unlock({
        email: 'a@test',
        masterPassword: 'wrong-password',
        kdfParams,
      }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });
});

describe('VaultClient CRUD', () => {
  it('create → list returns the decrypted item', async () => {
    const client = createVaultClient(new InMemoryRepository());
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const created = await client.create(samplePayload, 'login');
    expect(created.payload.password).toBe('pw-1234567890');

    const list = await client.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.payload.url).toBe('https://mail.google.com');
  });

  it('update bumps version and rejects stale writes', async () => {
    const client = createVaultClient(new InMemoryRepository());
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const created = await client.create(samplePayload, 'login');
    const updated = await client.update(
      created.id,
      { ...samplePayload, password: 'rotated' },
      created.version,
    );
    expect(updated.version).toBe(2);
    const reRead = await client.read(created.id);
    expect(reRead.payload.password).toBe('rotated');

    // Same expectedVersion again should fail because the row has moved on.
    await expect(
      client.update(created.id, { ...samplePayload, password: 'race' }, created.version),
    ).rejects.toThrow(/version|conflict/i);
  });

  it('delete removes the item', async () => {
    const client = createVaultClient(new InMemoryRepository());
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const created = await client.create(samplePayload, 'login');
    await client.delete(created.id);
    const list = await client.list();
    expect(list).toHaveLength(0);
  });

  it('local search filters by name and username (case-insensitive, NFKC)', async () => {
    const client = createVaultClient(new InMemoryRepository());
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    await client.create({ ...samplePayload, name: 'Gmail', username: 'me@gmail.com' }, 'login');
    await client.create({ ...samplePayload, name: 'GitHub', username: 'dev@gh.com' }, 'login');
    const all = await client.list();
    expect(client.search(all, 'GIT')).toHaveLength(1);
    expect(client.search(all, 'gmail')).toHaveLength(1);
    expect(client.search(all, 'me@')).toHaveLength(1);
    expect(client.search(all, 'nothing')).toHaveLength(0);
  });

  it('searchHashFor produces a stable HMAC the server can index', async () => {
    const client = createVaultClient(new InMemoryRepository());
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const h1 = client.searchHashFor('GMAIL.COM');
    const h2 = client.searchHashFor('  gmail.com ');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('VaultClient Realtime sync', () => {
  it('subscribe receives decrypted item on INSERT from same client', async () => {
    const repo = new InMemoryRepository();
    const client = createVaultClient(repo);
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const events: string[] = [];
    const unsub = client.subscribe((e) => {
      events.push(`${e.type}:${e.item?.payload.name ?? ''}`);
    });
    await client.create({ ...samplePayload, name: 'X' }, 'login');
    expect(events).toContain('insert:X');
    unsub();
  });

  it('unsubscribe stops further events', async () => {
    const repo = new InMemoryRepository();
    const client = createVaultClient(repo);
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    let count = 0;
    const unsub = client.subscribe(() => count++);
    await client.create({ ...samplePayload, name: 'X' }, 'login');
    unsub();
    await client.create({ ...samplePayload, name: 'Y' }, 'login');
    expect(count).toBe(1);
  });
});

describe('VaultClient auto-lock', () => {
  it('auto-locks after configured idle time', async () => {
    const client = createVaultClient(new InMemoryRepository(), { autoLockMs: 50 });
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    expect(client.isUnlocked()).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(client.isUnlocked()).toBe(false);
  });

  it('touch() resets the auto-lock countdown', async () => {
    const client = createVaultClient(new InMemoryRepository(), { autoLockMs: 100 });
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    await new Promise((r) => setTimeout(r, 60));
    client.touch();
    await new Promise((r) => setTimeout(r, 60));
    expect(client.isUnlocked()).toBe(true);
    client.lock();
  });
});
