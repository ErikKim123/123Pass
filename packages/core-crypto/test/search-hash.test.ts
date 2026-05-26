import { describe, expect, it } from 'vitest';

import { deriveSearchKey, getRandomBytes, normalizeSearchInput, searchHash } from '../src';

describe('searchHash', () => {
  it('produces deterministic output for same input + key', () => {
    const vaultKey = getRandomBytes(32);
    const k = deriveSearchKey(vaultKey);
    expect(searchHash(k, 'Gmail')).toBe(searchHash(k, 'Gmail'));
  });

  it('normalizes case and whitespace before hashing', () => {
    const k = deriveSearchKey(getRandomBytes(32));
    expect(searchHash(k, '  gmail  ')).toBe(searchHash(k, 'GMAIL'));
    expect(searchHash(k, 'Gmail')).toBe(searchHash(k, 'gmail'));
  });

  it('different vault keys yield different hashes for same input', () => {
    const k1 = deriveSearchKey(getRandomBytes(32));
    const k2 = deriveSearchKey(getRandomBytes(32));
    expect(searchHash(k1, 'gmail.com')).not.toBe(searchHash(k2, 'gmail.com'));
  });

  it('normalizeSearchInput applies NFKC', () => {
    // FULLWIDTH LATIN CAPITAL LETTER G -> 'g' after NFKC + lowercase
    expect(normalizeSearchInput('Ｇmail')).toBe('gmail');
  });

  it('produces a hex string of length 64 (SHA-256)', () => {
    const k = deriveSearchKey(getRandomBytes(32));
    expect(searchHash(k, 'gmail')).toMatch(/^[0-9a-f]{64}$/);
  });
});
