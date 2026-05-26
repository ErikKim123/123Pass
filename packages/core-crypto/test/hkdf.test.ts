import { describe, expect, it } from 'vitest';

import { hexDecode, hexEncode, hkdf } from '../src';

import vectors from './vectors/rfc5869-hkdf.json' with { type: 'json' };

describe('HKDF-SHA256 (RFC 5869)', () => {
  for (const v of vectors) {
    it(v.name, () => {
      const out = hkdf({
        ikm: hexDecode(v.ikm),
        salt: v.salt ? hexDecode(v.salt) : undefined,
        info: v.info ? hexDecode(v.info) : undefined,
        length: v.length,
      });
      expect(hexEncode(out)).toBe(v.okm);
    });
  }

  it('accepts string info parameter', () => {
    const out = hkdf({ ikm: new Uint8Array(32).fill(7), info: 'context-string', length: 32 });
    expect(out.length).toBe(32);
  });
});
