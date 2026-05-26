// Looks up cached KDF params for an email so LockScreen can unlock without prompting twice.
// In live mode, the lookup would call an unauthenticated Supabase edge function.
// In mock mode, we read directly from the mock user-records via the repository.

import type { KdfParams } from '@123pass/shared';

import { getVaultRepository } from './supabase';

const STORAGE_PREFIX = '__123pass_kdf_';

export function cacheKdfParams(email: string, params: KdfParams): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + email.toLowerCase(), JSON.stringify(params));
  } catch {
    // ignore quota errors
  }
}

export function readCachedKdfParams(email: string): KdfParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + email.toLowerCase());
    return raw ? (JSON.parse(raw) as KdfParams) : null;
  } catch {
    return null;
  }
}

export async function lookupKdfParams(email: string): Promise<KdfParams> {
  const cached = readCachedKdfParams(email);
  if (cached) return cached;

  // Mock fallback: read from the in-memory directory and cache.
  const repo = await getVaultRepository();
  const directoryEntry = await repo.getUserDirectoryEntry(email);
  if (!directoryEntry) throw new Error('User not found');

  // Mock-mode-only path: read the user record (only works when not signed-in checks fail).
  const record = await repo.getUserRecord(directoryEntry.id);
  if (!record) throw new Error('User profile not found');
  cacheKdfParams(email, record.kdfParams);
  return record.kdfParams;
}
