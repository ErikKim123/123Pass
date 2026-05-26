// Design Ref: Plan SC — "DB dump produces zero plaintext credentials."
// Inspects every payload the SDK hands to the Repository.

import { describe, expect, it } from 'vitest';

import { base64Encode } from '@123pass/core-crypto';

import { createVaultClient, type VaultItemPayload } from '../src';

import { InMemoryRepository } from './repository-mock';

const fastKdf = { memoryCost: 8192, timeCost: 1, parallelism: 1 } as const;

const samplePayload: VaultItemPayload = {
  name: 'Gmail',
  url: 'https://mail.google.com',
  username: 'me@gmail.com',
  password: 'extremely-secret-pw-9!',
  notes: 'recovery email is alt@example.com',
  totpSecret: 'GEZDGNBVGY3TQOJQ',
  tags: ['personal', 'email'],
};

function containsAnyPlaintextSecret(blob: unknown): string[] {
  const json = JSON.stringify(blob);
  const hits: string[] = [];
  if (json.includes(samplePayload.password!)) hits.push('password');
  if (json.includes(samplePayload.username!)) hits.push('username');
  if (json.includes(samplePayload.url!)) hits.push('url');
  if (json.includes(samplePayload.notes!)) hits.push('notes');
  if (json.includes(samplePayload.totpSecret!)) hits.push('totpSecret');
  return hits;
}

describe('zero-knowledge: Repository never sees plaintext credentials', () => {
  it('createItem sends only ciphertext/iv/authTag/searchHash/meta', async () => {
    const repo = new InMemoryRepository();
    const client = createVaultClient(repo);
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });

    await client.create(samplePayload, 'login');

    expect(repo.capturedInsertPayloads).toHaveLength(1);
    const captured = repo.capturedInsertPayloads[0]!;
    expect(containsAnyPlaintextSecret(captured)).toEqual([]);
    expect(Object.keys(captured).sort()).toEqual(
      [
        'authTag',
        'ciphertext',
        'favorite',
        'folderId',
        'iv',
        'itemType',
        'searchHash',
        'version',
      ].sort(),
    );
  });

  it('updateItem ciphertext changes when payload changes', async () => {
    const repo = new InMemoryRepository();
    const client = createVaultClient(repo);
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const created = await client.create(samplePayload, 'login');
    const beforeCipher = repo.capturedInsertPayloads[0]!.ciphertext;

    await client.update(
      created.id,
      { ...samplePayload, password: 'new-secret-pw' },
      created.version,
    );

    expect(repo.capturedUpdatePayloads).toHaveLength(1);
    const u = repo.capturedUpdatePayloads[0]!;
    expect(JSON.stringify(u)).not.toContain('new-secret-pw');
    expect(JSON.stringify(u)).not.toContain('extremely-secret-pw-9!');
    expect(u.ciphertext).not.toBe(beforeCipher);
  });

  it('rotateMasterPassword re-encrypts every item under the new vaultKey', async () => {
    const repo = new InMemoryRepository();
    const client = createVaultClient(repo);
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const a = await client.create({ ...samplePayload, name: 'A' }, 'login');
    const b = await client.create({ ...samplePayload, name: 'B' }, 'login');

    const oldCipherA = repo.capturedInsertPayloads.find((p) => p.version === 1 && p.itemType === 'login');
    void oldCipherA;
    void a;
    void b;

    const result = await client.rotate({
      newMasterPassword: 'new-master-99999',
      kdfOverrides: fastKdf,
    });
    expect(result.reEncryptedCount).toBe(2);

    const after = await client.list();
    expect(after.map((i) => i.payload.name).sort()).toEqual(['A', 'B']);
  });

  it('share payload exposes only ephemeral pubkey + ciphertext/iv/authTag', async () => {
    const repo = new InMemoryRepository();

    // Sign Bob up first (so the directory has his public key) then sign out.
    const bob = createVaultClient(repo);
    await bob.signUp({
      email: 'bob@test',
      masterPassword: 'bob-pw-12345',
      kdfOverrides: fastKdf,
    });
    await repo.signOut();
    bob.lock();

    // Now Alice signs up and creates an item.
    const alice = createVaultClient(repo);
    await alice.signUp({
      email: 'alice@test',
      masterPassword: 'alice-pw-12345',
      kdfOverrides: fastKdf,
    });
    const aliceVaultKeyB64 = base64Encode(alice.currentSession().vaultKey);
    const item = await alice.create(samplePayload, 'login');

    await alice.share({
      itemId: item.id,
      recipientEmail: 'bob@test',
      permission: 'read',
    });

    expect(repo.capturedSharePayloads).toHaveLength(1);
    const p = repo.capturedSharePayloads[0]!;
    expect(JSON.stringify(p)).not.toContain(aliceVaultKeyB64);
    expect(p.wrappedKey.ephemeralPublicKey.length).toBeGreaterThan(0);
    expect(p.wrappedKey.authTag.length).toBe(24); // base64(16 bytes)
    expect(p.wrappedKey.iv.length).toBe(16); // base64(12 bytes)
    expect(p.permission).toBe('read');
  });
});
