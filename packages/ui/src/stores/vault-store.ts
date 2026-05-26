// Design Ref: §7.2 / §10.4 — single Zustand store holds the VaultClient.
// Components subscribe to lock state + decrypted item list.

import { create } from 'zustand';

import type { DecryptedItem, VaultClient } from '@123pass/vault-sdk';

export interface VaultStoreState {
  client: VaultClient | null;
  isUnlocked: boolean;
  items: DecryptedItem[];
  selectedItemId: string | null;
  query: string;
  loading: boolean;
  error: string | null;
}

export interface VaultStoreActions {
  attach: (client: VaultClient) => void;
  refresh: () => Promise<void>;
  unlock: (email: string, masterPassword: string, kdfParams: Parameters<VaultClient['unlock']>[0]['kdfParams']) => Promise<void>;
  lock: () => void;
  select: (id: string | null) => void;
  setQuery: (q: string) => void;
}

export type VaultStore = VaultStoreState & VaultStoreActions;

const initialState: VaultStoreState = {
  client: null,
  isUnlocked: false,
  items: [],
  selectedItemId: null,
  query: '',
  loading: false,
  error: null,
};

export const useVaultStore = create<VaultStore>((set, get) => ({
  ...initialState,

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
      set({ items, loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  unlock: async (email, masterPassword, kdfParams) => {
    const client = get().client;
    if (!client) throw new Error('VaultClient not attached. Call attach() first.');
    set({ loading: true, error: null });
    try {
      await client.unlock({ email, masterPassword, kdfParams });
      const items = await client.list();
      set({ isUnlocked: true, items, loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message, isUnlocked: false });
      throw e;
    }
  },

  lock: () => {
    const client = get().client;
    if (client) client.lock();
    set({ ...initialState, client: get().client });
  },

  select: (id) => set({ selectedItemId: id }),
  setQuery: (q) => set({ query: q }),
}));
