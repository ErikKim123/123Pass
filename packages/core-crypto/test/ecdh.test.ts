import { describe, expect, it } from 'vitest';

import {
  base64Encode,
  decrypt,
  deriveSharedKey,
  encrypt,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64,
  utf8Decode,
  utf8Encode,
} from '../src';

describe('ECDH P-256 + HKDF', () => {
  it('two parties derive the same shared key', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const aliceShared = deriveSharedKey({
      privateKey: alice.privateKey,
      peerPublicKey: bob.publicKey,
      info: 'test-wrap',
    });
    const bobShared = deriveSharedKey({
      privateKey: bob.privateKey,
      peerPublicKey: alice.publicKey,
      info: 'test-wrap',
    });
    expect(base64Encode(aliceShared)).toBe(base64Encode(bobShared));
  });

  it('different info strings yield different keys (domain separation)', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const k1 = deriveSharedKey({
      privateKey: alice.privateKey,
      peerPublicKey: bob.publicKey,
      info: 'info-A',
    });
    const k2 = deriveSharedKey({
      privateKey: alice.privateKey,
      peerPublicKey: bob.publicKey,
      info: 'info-B',
    });
    expect(base64Encode(k1)).not.toEqual(base64Encode(k2));
  });

  it('can wrap and unwrap a vault key via shared key', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const ephemeral = generateKeyPair(); // sender ephemeral — PFS

    const senderShared = deriveSharedKey({
      privateKey: ephemeral.privateKey,
      peerPublicKey: bob.publicKey,
      info: 'wrap-key-v1',
    });
    const wrapped = encrypt(senderShared, utf8Encode('vault-secret-key-bytes'));

    const recipientShared = deriveSharedKey({
      privateKey: bob.privateKey,
      peerPublicKey: ephemeral.publicKey,
      info: 'wrap-key-v1',
    });
    const unwrapped = decrypt(recipientShared, wrapped);
    expect(utf8Decode(unwrapped)).toBe('vault-secret-key-bytes');

    // Alice (random third party) cannot derive the same wrap key.
    const intruder = deriveSharedKey({
      privateKey: alice.privateKey,
      peerPublicKey: ephemeral.publicKey,
      info: 'wrap-key-v1',
    });
    expect(base64Encode(intruder)).not.toEqual(base64Encode(recipientShared));
  });

  it('public key base64 round-trip', () => {
    const kp = generateKeyPair();
    const b64 = publicKeyToBase64(kp.publicKey);
    const restored = publicKeyFromBase64(b64);
    expect(base64Encode(restored)).toBe(b64);
  });
});
