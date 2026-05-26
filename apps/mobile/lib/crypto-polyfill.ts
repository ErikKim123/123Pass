// React Native Hermes does not provide crypto.getRandomValues by default.
// expo-crypto exposes it via globalThis. Import this module once at app entry.

import * as ExpoCrypto from 'expo-crypto';

interface MinimalCrypto {
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
}

declare global {
  // eslint-disable-next-line no-var
  var crypto: MinimalCrypto;
}

const existing = (globalThis as { crypto?: MinimalCrypto }).crypto;
if (!existing || typeof existing.getRandomValues !== 'function') {
  (globalThis as { crypto: MinimalCrypto }).crypto = {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (!array) return array;
      const view = array as unknown as Uint8Array;
      const bytes = ExpoCrypto.getRandomBytes(view.byteLength);
      view.set(bytes);
      return array;
    },
  };
}
