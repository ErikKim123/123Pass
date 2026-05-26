'use client';

// Initialises the VaultClient and attaches it to the Zustand store.
// Auto-locks after AUTO_LOCK_MS of inactivity. Lives at the root layout level.

import { useEffect, useState } from 'react';

import { AUTO_LOCK_MS } from '@123pass/shared';
import { useVaultStore } from '@123pass/ui';
import { createVaultClient } from '@123pass/vault-sdk';

import { getVaultRepository } from '@/lib/supabase';

export function VaultProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const attach = useVaultStore((s) => s.attach);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const repo = await getVaultRepository();
      if (cancelled) return;
      const client = createVaultClient(repo, { autoLockMs: AUTO_LOCK_MS });
      attach(client);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [attach]);

  if (!ready) {
    return (
      <div data-testid="vault-loading" style={{ padding: 24 }}>
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}
