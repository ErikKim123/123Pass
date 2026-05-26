import { afterEach, describe, expect, it } from 'vitest';

import { useVaultStore } from '../src/stores/vault-store';

describe('vault-store', () => {
  afterEach(() => {
    // Reset zustand store between tests.
    useVaultStore.setState({
      client: null,
      isUnlocked: false,
      items: [],
      selectedItemId: null,
      query: '',
      loading: false,
      error: null,
    });
  });

  it('selects an item id', () => {
    useVaultStore.getState().select('item-1');
    expect(useVaultStore.getState().selectedItemId).toBe('item-1');
  });

  it('updates query', () => {
    useVaultStore.getState().setQuery('gmail');
    expect(useVaultStore.getState().query).toBe('gmail');
  });

  it('throws if unlock() is called without a client attached', async () => {
    await expect(
      useVaultStore.getState().unlock('a@test', 'pw', {
        memoryCost: 8192,
        timeCost: 1,
        parallelism: 1,
        saltAuth: 'AAAAAAAAAAAAAAAAAAAAAA==',
        saltVault: 'BBBBBBBBBBBBBBBBBBBBBB==',
      }),
    ).rejects.toThrow(/not attached/);
  });
});
