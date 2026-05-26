import { describe, expect, it } from 'vitest';

import {
  base64Decode,
  base64Encode,
  CryptoError,
  decrypt,
  encrypt,
  ERR_DECRYPT_FAILED,
  ERR_INVALID_KEY_LENGTH,
  getRandomBytes,
  utf8Decode,
  utf8Encode,
} from '../src';

describe('AES-256-GCM encrypt/decrypt', () => {
  it('round-trips arbitrary plaintext', () => {
    const key = getRandomBytes(32);
    const pt = utf8Encode('패스워드 매니저 vault item — secret value');
    const blob = encrypt(key, pt);
    const out = decrypt(key, blob);
    expect(utf8Decode(out)).toBe('패스워드 매니저 vault item — secret value');
  });

  it('emits 12-byte IV and 16-byte tag', () => {
    const blob = encrypt(getRandomBytes(32), utf8Encode('hi'));
    expect(base64Decode(blob.iv).length).toBe(12);
    expect(base64Decode(blob.authTag).length).toBe(16);
  });

  it('uses a fresh random IV per call (no reuse)', () => {
    const key = getRandomBytes(32);
    const pt = utf8Encode('same plaintext');
    const a = encrypt(key, pt);
    const b = encrypt(key, pt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('fails authentication when ciphertext is tampered', () => {
    const key = getRandomBytes(32);
    const blob = encrypt(key, utf8Encode('payload'));
    const tampered = {
      ...blob,
      ciphertext: base64Encode(base64Decode(blob.ciphertext).map((b, i) => (i === 0 ? b ^ 1 : b))),
    };
    expect(() => decrypt(key, tampered)).toThrow(CryptoError);
    try {
      decrypt(key, tampered);
    } catch (e) {
      expect((e as CryptoError).code).toBe(ERR_DECRYPT_FAILED);
    }
  });

  it('fails authentication when authTag is tampered', () => {
    const key = getRandomBytes(32);
    const blob = encrypt(key, utf8Encode('payload'));
    const tampered = {
      ...blob,
      authTag: base64Encode(base64Decode(blob.authTag).map((b, i) => (i === 0 ? b ^ 1 : b))),
    };
    expect(() => decrypt(key, tampered)).toThrow(/auth tag/);
  });

  it('binds AAD — decrypt fails when AAD differs', () => {
    const key = getRandomBytes(32);
    const aadA = utf8Encode('item-id-A');
    const aadB = utf8Encode('item-id-B');
    const blob = encrypt(key, utf8Encode('payload'), aadA);
    expect(() => decrypt(key, blob, aadB)).toThrow(CryptoError);
    expect(utf8Decode(decrypt(key, blob, aadA))).toBe('payload');
  });

  it('rejects wrong-length keys', () => {
    expect(() => encrypt(getRandomBytes(16), utf8Encode('x'))).toThrow(CryptoError);
    try {
      encrypt(getRandomBytes(16), utf8Encode('x'));
    } catch (e) {
      expect((e as CryptoError).code).toBe(ERR_INVALID_KEY_LENGTH);
    }
  });

  it('rejects malformed IV length', () => {
    const key = getRandomBytes(32);
    const blob = encrypt(key, utf8Encode('payload'));
    const bad = { ...blob, iv: base64Encode(getRandomBytes(16)) };
    expect(() => decrypt(key, bad)).toThrow(/iv must be 12 bytes/);
  });

  it('rejects malformed authTag length', () => {
    const key = getRandomBytes(32);
    const blob = encrypt(key, utf8Encode('payload'));
    const bad = { ...blob, authTag: base64Encode(getRandomBytes(8)) };
    expect(() => decrypt(key, bad)).toThrow(/authTag must be 16 bytes/);
  });

  it('rejects non-Uint8Array plaintext', () => {
    const key = getRandomBytes(32);
    // @ts-expect-error — intentionally wrong type at the boundary
    expect(() => encrypt(key, 'string-plaintext')).toThrow(/Uint8Array/);
  });
});
