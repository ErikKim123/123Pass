import { describe, expect, it } from 'vitest';

import {
  base64Encode,
  CryptoError,
  deriveRecoveryKey,
  ERR_RECOVERY_INVALID,
  generateRecoveryPhrase,
  isValidRecoveryPhrase,
} from '../src';

describe('recovery (BIP39 24-word)', () => {
  it('generates a 24-word phrase', () => {
    const phrase = generateRecoveryPhrase();
    expect(phrase.split(' ').length).toBe(24);
  });

  it('round-trips: generated phrase validates and derives a 32-byte key', () => {
    const phrase = generateRecoveryPhrase();
    expect(isValidRecoveryPhrase(phrase)).toBe(true);
    const key = deriveRecoveryKey(phrase);
    expect(key.length).toBe(32);
  });

  it('same phrase derives same recovery key (deterministic)', () => {
    const phrase = generateRecoveryPhrase();
    const a = deriveRecoveryKey(phrase);
    const b = deriveRecoveryKey(phrase);
    expect(base64Encode(a)).toBe(base64Encode(b));
  });

  it('different phrases derive different keys', () => {
    const a = deriveRecoveryKey(generateRecoveryPhrase());
    const b = deriveRecoveryKey(generateRecoveryPhrase());
    expect(base64Encode(a)).not.toBe(base64Encode(b));
  });

  it('rejects invalid phrase (bad checksum)', () => {
    // Replace last word with one from the wordlist that breaks the checksum.
    const phrase = generateRecoveryPhrase().split(' ');
    phrase[phrase.length - 1] = 'abandon';
    const bad = phrase.join(' ');
    // BIP39 makes this almost-always invalid; rerun guard if luck strikes.
    if (isValidRecoveryPhrase(bad)) return;
    expect(() => deriveRecoveryKey(bad)).toThrow(CryptoError);
    try {
      deriveRecoveryKey(bad);
    } catch (e) {
      expect((e as CryptoError).code).toBe(ERR_RECOVERY_INVALID);
    }
  });

  it('rejects gibberish phrase', () => {
    expect(isValidRecoveryPhrase('not a real bip39 phrase at all')).toBe(false);
    expect(() => deriveRecoveryKey('not a real bip39 phrase at all')).toThrow(CryptoError);
  });
});
