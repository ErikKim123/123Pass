// Tauri plugin Store API mocked — we exercise the Repository contract without a Tauri runtime.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, unknown>();

vi.mock('@tauri-apps/plugin-store', () => {
  class LazyStore {
    constructor(_file: string) {
      void _file;
    }
    async get<T>(key: string): Promise<T | undefined> {
      return storage.get(key) as T | undefined;
    }
    async set(key: string, value: unknown): Promise<void> {
      storage.set(key, value);
    }
    async delete(key: string): Promise<void> {
      storage.delete(key);
    }
    async save(): Promise<void> {
      /* noop */
    }
  }
  return { LazyStore };
});

import { TauriStoreRepository } from '../src/lib/tauri-repo';

describe('TauriStoreRepository (mock)', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('signUp creates an auth user and starts a session', async () => {
    const repo = new TauriStoreRepository();
    const { userId } = await repo.signUp('a@test', 'authhash');
    expect(userId).toBeTruthy();
    expect(await repo.currentUserId()).toBe(userId);
  });

  it('signIn rejects wrong credentials', async () => {
    const repo = new TauriStoreRepository();
    await repo.signUp('a@test', 'authhash');
    await repo.signOut();
    await expect(repo.signIn('a@test', 'wrong')).rejects.toThrow(/invalid credentials/);
  });

  it('insertItem / listItems round trip stores only ciphertext fields', async () => {
    const repo = new TauriStoreRepository();
    await repo.signUp('a@test', 'h');
    const row = await repo.insertItem({
      ciphertext: 'CTXT',
      iv: 'IV',
      authTag: 'TAG',
      itemType: 'login',
      searchHash: null,
      folderId: null,
      favorite: false,
      version: 1,
    });
    expect(row.user_id).toBeTruthy();
    expect(row.ciphertext).toBe('CTXT');
    const list = await repo.listItems();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(row.id);
  });

  it('updateItem rejects stale version', async () => {
    const repo = new TauriStoreRepository();
    await repo.signUp('a@test', 'h');
    const row = await repo.insertItem({
      ciphertext: 'C1',
      iv: 'I1',
      authTag: 'T1',
      itemType: 'login',
      searchHash: null,
      folderId: null,
      favorite: false,
      version: 1,
    });
    await repo.updateItem(row.id, {
      ciphertext: 'C2',
      iv: 'I2',
      authTag: 'T2',
      searchHash: null,
      expectedVersion: 1,
      newVersion: 2,
    });
    await expect(
      repo.updateItem(row.id, {
        ciphertext: 'C3',
        iv: 'I3',
        authTag: 'T3',
        searchHash: null,
        expectedVersion: 1,
        newVersion: 2,
      }),
    ).rejects.toThrow(/version/);
  });

  it('listItems returns only the current user rows', async () => {
    const repo = new TauriStoreRepository();
    await repo.signUp('a@test', 'h1');
    await repo.insertItem({
      ciphertext: 'A',
      iv: 'I',
      authTag: 'T',
      itemType: 'login',
      searchHash: null,
      folderId: null,
      favorite: false,
      version: 1,
    });
    await repo.signOut();
    await repo.signUp('b@test', 'h2');
    const list = await repo.listItems();
    expect(list).toHaveLength(0);
  });
});
