// Design Ref: §7.3 — ECDH P-256 + HKDF for 1:1 sharing.
// Ephemeral sender keypair gives PFS (V6.2.6).

import { p256 } from '@noble/curves/p256';

import { base64Decode, base64Encode } from './base';
import { hkdf } from './hkdf';

export interface KeyPair {
  publicKey: Uint8Array; // 65 bytes — uncompressed (0x04 || X || Y)
  privateKey: Uint8Array; // 32 bytes
}

export function generateKeyPair(): KeyPair {
  const privateKey = p256.utils.randomPrivateKey();
  const publicKey = p256.getPublicKey(privateKey, false); // uncompressed
  return { publicKey, privateKey };
}

/**
 * Derive a shared 256-bit wrapping key from one party's private key and the
 * other party's public key, then run HKDF-SHA256 to bind it to a context.
 */
export function deriveSharedKey(params: {
  privateKey: Uint8Array;
  peerPublicKey: Uint8Array;
  info: string;
  length?: number;
}): Uint8Array {
  const sharedSecret = p256.getSharedSecret(params.privateKey, params.peerPublicKey, false);
  // Drop the leading 0x04 prefix from the uncompressed shared secret
  // and use the X coordinate (first 32 bytes after prefix) as IKM.
  const ikm = sharedSecret.subarray(1, 33);
  return hkdf({ ikm, info: params.info, length: params.length ?? 32 });
}

export function publicKeyToBase64(pk: Uint8Array): string {
  return base64Encode(pk);
}

export function publicKeyFromBase64(s: string): Uint8Array {
  return base64Decode(s);
}
