// Unit test for biometric module behaviour — mocks expo modules so it runs in node.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStoreState = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStoreState.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreState.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreState.delete(key);
  }),
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
}));

vi.mock('expo-local-authentication', () => ({
  hasHardwareAsync: vi.fn(async () => true),
  isEnrolledAsync: vi.fn(async () => true),
  authenticateAsync: vi.fn(async () => ({ success: true })),
}));

// Re-import after mocks are registered.
import {
  disableBiometricUnlock,
  enableBiometricUnlock,
  isBiometricSupported,
  tryBiometricUnlock,
} from '../lib/biometric';

describe('biometric', () => {
  beforeEach(() => {
    secureStoreState.clear();
  });

  it('reports support when hardware is present and enrolled', async () => {
    expect(await isBiometricSupported()).toBe(true);
  });

  it('wrap → unwrap round trip recovers the vault key', async () => {
    const vaultKey = new Uint8Array(32).fill(7);
    await enableBiometricUnlock(vaultKey);
    const recovered = await tryBiometricUnlock();
    expect(recovered).toEqual(vaultKey);
  });

  it('disable removes both stored entries', async () => {
    await enableBiometricUnlock(new Uint8Array(32).fill(1));
    await disableBiometricUnlock();
    expect(await tryBiometricUnlock()).toBeNull();
  });

  it('tryBiometricUnlock returns null when nothing has been stored', async () => {
    expect(await tryBiometricUnlock()).toBeNull();
  });
});
