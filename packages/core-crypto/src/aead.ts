// Design Ref: §7.3 — AES-256-GCM with random 12-byte IV per encryption.
// V6.2.4: IV reuse forbidden — caller MUST NOT pass a fixed IV.

import { gcm } from '@noble/ciphers/aes';

import {
  AES_GCM_IV_LENGTH,
  AES_GCM_TAG_LENGTH,
  AES_KEY_LENGTH,
} from '@123pass/shared';

import { base64Decode, base64Encode } from './base';
import {
  CryptoError,
  ERR_DECRYPT_FAILED,
  ERR_INVALID_INPUT,
  ERR_INVALID_IV_LENGTH,
  ERR_INVALID_KEY_LENGTH,
} from './errors';
import { getRandomBytes } from './random';

export interface AeadCiphertext {
  ciphertext: string; // base64 (ciphertext only — no tag)
  iv: string; // base64
  authTag: string; // base64
}

function assertKey(key: Uint8Array): void {
  if (!(key instanceof Uint8Array) || key.length !== AES_KEY_LENGTH) {
    throw new CryptoError(
      ERR_INVALID_KEY_LENGTH,
      `key must be ${AES_KEY_LENGTH} bytes (received ${key?.length ?? 'undefined'})`,
    );
  }
}

export function encrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): AeadCiphertext {
  assertKey(key);
  if (!(plaintext instanceof Uint8Array)) {
    throw new CryptoError(ERR_INVALID_INPUT, 'plaintext must be a Uint8Array');
  }
  const iv = getRandomBytes(AES_GCM_IV_LENGTH);
  const cipher = gcm(key, iv, aad);
  const combined = cipher.encrypt(plaintext);

  // @noble/ciphers returns ciphertext || tag in a single buffer.
  if (combined.length < AES_GCM_TAG_LENGTH) {
    throw new CryptoError(ERR_INVALID_INPUT, 'encryption produced impossibly small output');
  }
  const ct = combined.subarray(0, combined.length - AES_GCM_TAG_LENGTH);
  const tag = combined.subarray(combined.length - AES_GCM_TAG_LENGTH);

  return {
    ciphertext: base64Encode(ct),
    iv: base64Encode(iv),
    authTag: base64Encode(tag),
  };
}

export function decrypt(key: Uint8Array, blob: AeadCiphertext, aad?: Uint8Array): Uint8Array {
  assertKey(key);
  const iv = base64Decode(blob.iv);
  if (iv.length !== AES_GCM_IV_LENGTH) {
    throw new CryptoError(
      ERR_INVALID_IV_LENGTH,
      `iv must be ${AES_GCM_IV_LENGTH} bytes (received ${iv.length})`,
    );
  }
  const ct = base64Decode(blob.ciphertext);
  const tag = base64Decode(blob.authTag);
  if (tag.length !== AES_GCM_TAG_LENGTH) {
    throw new CryptoError(
      ERR_INVALID_INPUT,
      `authTag must be ${AES_GCM_TAG_LENGTH} bytes (received ${tag.length})`,
    );
  }
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct, 0);
  combined.set(tag, ct.length);

  try {
    const cipher = gcm(key, iv, aad);
    return cipher.decrypt(combined);
  } catch (e) {
    throw new CryptoError(
      ERR_DECRYPT_FAILED,
      `AES-GCM auth tag verification failed: ${(e as Error).message ?? 'tag mismatch'}`,
    );
  }
}
