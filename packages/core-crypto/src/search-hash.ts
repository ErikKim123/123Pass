// Design Ref: §3.1 / §7.3 — deterministic HMAC for searchable encryption.
// The key is derived from the vault key via HKDF so it never leaves the device.

import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

import { HKDF_INFO_SEARCH } from '@123pass/shared';

import { hexEncode, utf8Encode } from './base';
import { hkdf } from './hkdf';

export function deriveSearchKey(vaultKey: Uint8Array): Uint8Array {
  return hkdf({ ikm: vaultKey, info: HKDF_INFO_SEARCH, length: 32 });
}

export function normalizeSearchInput(s: string): string {
  return s.trim().toLowerCase().normalize('NFKC');
}

export function searchHash(searchKey: Uint8Array, input: string): string {
  const data = utf8Encode(normalizeSearchInput(input));
  return hexEncode(hmac(sha256, searchKey, data));
}
