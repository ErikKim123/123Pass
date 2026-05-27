'use client';

// Initialises the VaultClient and attaches it to the Zustand store.
// Auto-locks after AUTO_LOCK_MS of inactivity. Lives at the root layout level.
// Subscribes to the repository's auth state changes so that out-of-band
// sign-outs (token expiry, another tab logging out, server-side revocation)
// also lock the in-memory vault.

import { useEffect, useState } from 'react';

import { AUTO_LOCK_MS } from '@123pass/shared';
import { useVaultStore } from '@123pass/ui';
import { createVaultClient } from '@123pass/vault-sdk';

import { setLastEmail } from '@/lib/last-email';
import { getVaultRepository } from '@/lib/supabase';

export function VaultProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const attach = useVaultStore((s) => s.attach);
  const lock = useVaultStore((s) => s.lock);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubAuth: (() => void) | null = null;

    void (async () => {
      const repo = await getVaultRepository();
      if (cancelled) return;
      const client = createVaultClient(repo, { autoLockMs: AUTO_LOCK_MS });
      attach(client);

      unsubAuth = repo.onAuthStateChange((change) => {
        // Remember the email so the next /login can pre-fill it.
        if (change.session?.email) setLastEmail(change.session.email);
        // Out-of-band sign-out (token revoked, expired, another tab) → drop
        // the in-memory vaultKey immediately.
        if (change.event === 'SIGNED_OUT') {
          lock();
        }
      });

      setReady(true);
    })();
    return () => {
      cancelled = true;
      unsubAuth?.();
    };
  }, [attach, lock]);

  if (!ready) {
    return (
      <div data-testid="vault-loading" style={{ padding: 24 }}>
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}
