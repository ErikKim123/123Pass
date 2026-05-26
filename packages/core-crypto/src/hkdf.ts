// Design Ref: §7.3 — HKDF-SHA256 for domain-separated key derivation.
// RFC 5869.

import { hkdf as nobleHkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

import { utf8Encode } from './base';

export interface HkdfParams {
  ikm: Uint8Array; // input key material
  salt?: Uint8Array;
  info?: Uint8Array | string;
  length: number; // output length in bytes
}

export function hkdf(params: HkdfParams): Uint8Array {
  const { ikm, salt, info, length } = params;
  const infoBytes = typeof info === 'string' ? utf8Encode(info) : info;
  return nobleHkdf(sha256, ikm, salt, infoBytes, length);
}
