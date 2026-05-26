// Convenience selector hooks over the Zustand store.

import { useEffect } from 'react';

import type { DecryptedItem } from '@123pass/vault-sdk';

import { useVaultStore } from '../stores/vault-store';

export function useFilteredItems(): DecryptedItem[] {
  const items = useVaultStore((s) => s.items);
  const query = useVaultStore((s) => s.query);
  const client = useVaultStore((s) => s.client);
  if (!query || !client) return items;
  return client.search(items, query);
}

export function useAutoRefresh(): void {
  const refresh = useVaultStore((s) => s.refresh);
  const client = useVaultStore((s) => s.client);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);

  useEffect(() => {
    if (!client || !isUnlocked) return;
    let cancelled = false;
    void refresh();
    const unsub = client.subscribe(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [client, isUnlocked, refresh]);
}
