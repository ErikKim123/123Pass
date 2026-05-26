// Design Ref: §7.1 V6.2.3 — only CSRNG, never Math.random.

import { randomBytes as nobleRandomBytes } from '@noble/hashes/utils';

import { base64Encode } from './base';

export function getRandomBytes(length: number): Uint8Array {
  if (length <= 0 || !Number.isInteger(length)) {
    throw new Error(`getRandomBytes: length must be a positive integer, got ${length}`);
  }
  // @noble/hashes proxies to crypto.getRandomValues (browser) or crypto.randomBytes (node).
  return nobleRandomBytes(length);
}

export function randomBase64(length: number): string {
  return base64Encode(getRandomBytes(length));
}
