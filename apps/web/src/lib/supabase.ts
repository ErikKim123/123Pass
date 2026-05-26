// Provides a VaultRepository for the running app — Supabase live OR in-memory mock.

import { createSupabaseClient, type VaultRepository } from '@123pass/vault-sdk';

import { env, hasLiveSupabase } from './env';

let cached: VaultRepository | null = null;

export async function getVaultRepository(): Promise<VaultRepository> {
  if (cached) return cached;

  if (hasLiveSupabase) {
    // Supabase adapter for the live VaultRepository is scheduled for the live-DB session;
    // until then we still need a real one. For now, fall back to mock with a console warning.
    console.warn(
      '[123Pass] Supabase env detected but the production VaultRepository adapter is not yet ' +
        'implemented (module-4 ADAPTER-01). Falling back to the in-memory mock.',
    );
    // Touch the client to surface config errors early.
    createSupabaseClient({
      url: env.NEXT_PUBLIC_SUPABASE_URL!,
      anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    });
  } else if (typeof window !== 'undefined') {
    console.warn(
      '[123Pass] NEXT_PUBLIC_SUPABASE_* env vars not set. Running in MOCK mode — data resets on tab close.',
    );
  }

  const { MockBrowserRepository } = await import('./mock-repo');
  cached = new MockBrowserRepository();
  return cached;
}
