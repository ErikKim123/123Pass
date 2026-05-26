// Tiny mobile-only Zustand store. Mirrors packages/ui/stores/vault-store but without DOM deps.

import { create } from 'zustand';

import type { DecryptedItem, VaultClient } from '@123pass/vault-sdk';

export interface MobileVaultState {
  client: VaultClient | null;
  isUnlocked: boolean;
  items: DecryptedItem[];
  loading: boolean;
  error: string | null;
}

export interface MobileVaultActions {
  attach: (client: VaultClient) => void;
  refresh: () => Promise<void>;
  lock: () => void;
}

export type MobileVaultStore = MobileVaultState & MobileVaultActions;

export const useVaultStore = create<MobileVaultStore>((set, get) => ({
  client: null,
  isUnlocked: false,
  items: [],
  loading: false,
  error: null,

  attach: (client) => set({ client, isUnlocked: client.isUnlocked() }),

  refresh: async () => {
    const client = get().client;
    if (!client || !client.isUnlocked()) {
      set({ items: [], isUnlocked: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const items = await client.list();
      set({ items, loading: false, isUnlocked: true });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  lock: () => {
    const client = get().client;
    if (client) client.lock();
    set({ isUnlocked: false, items: [] });
  },
}));
