// Design Ref: §9.3 — only vault-sdk depends on @supabase/supabase-js.
// Apps must NOT instantiate Supabase clients directly; they call createVaultClient() (module-4).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// IMPORTANT: the SDK-facing Database type comes from the AUTO-GENERATED file
// (which mirrors `supabase gen types typescript` output). The hand-written
// `database.types.ts` keeps domain-friendly aliases (literal unions, structured
// JSONB shapes) that downstream code prefers — but that shape does NOT satisfy
// @supabase/postgrest-js's GenericSchema constraint in strict mode.
import type { Database } from './database.types.generated';

export interface SupabaseClientOptions {
  url: string;
  anonKey: string;
  /**
   * Persist the auth session. true for browsers + native apps, false for ephemeral CLI usage.
   * Defaults to true.
   */
  persistSession?: boolean;
  /** Storage adapter (window.localStorage by default in browsers). */
  storage?: {
    getItem: (key: string) => string | null | Promise<string | null>;
    setItem: (key: string, value: string) => void | Promise<void>;
    removeItem: (key: string) => void | Promise<void>;
  };
}

export type TypedSupabaseClient = SupabaseClient<Database>;

export function createSupabaseClient(options: SupabaseClientOptions): TypedSupabaseClient {
  if (!options.url || !options.anonKey) {
    throw new Error(
      'createSupabaseClient: url and anonKey are required. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or platform equivalents).',
    );
  }
  return createClient<Database>(options.url, options.anonKey, {
    auth: {
      persistSession: options.persistSession ?? true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: options.storage,
    },
  });
}
