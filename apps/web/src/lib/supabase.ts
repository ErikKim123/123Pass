// Provides a VaultRepository for the running app — Supabase live OR in-memory mock.

import {
  createSupabaseClient,
  createSupabaseRepository,
  type VaultRepository,
} from '@123pass/vault-sdk';

import { env, hasLiveSupabase } from './env';

let cached: VaultRepository | null = null;

export async function getVaultRepository(): Promise<VaultRepository> {
  if (cached) return cached;

  if (hasLiveSupabase) {
    const client = createSupabaseClient({
      url: env.NEXT_PUBLIC_SUPABASE_URL!,
      anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    });
    cached = createSupabaseRepository(client);
    return cached;
  }

  if (typeof window !== 'undefined') {
    console.warn(
      '[123Pass] NEXT_PUBLIC_SUPABASE_* env vars not set. Running in MOCK mode — data resets on tab close.',
    );
  }
  const { MockBrowserRepository } = await import('./mock-repo');
  cached = new MockBrowserRepository();
  return cached;
}
