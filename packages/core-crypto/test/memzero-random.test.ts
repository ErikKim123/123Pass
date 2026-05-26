import { describe, expect, it } from 'vitest';

import { base64Decode, getRandomBytes, memzero, randomBase64 } from '../src';

describe('memzero', () => {
  it('fills the buffer with zeros', () => {
    const buf = new Uint8Array([1, 2, 3, 4]);
    memzero(buf);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0]);
  });

  it('is a no-op on null/undefined', () => {
    expect(() => memzero(null)).not.toThrow();
    expect(() => memzero(undefined)).not.toThrow();
  });
});

describe('getRandomBytes', () => {
  it('returns a Uint8Array of the requested length', () => {
    const buf = getRandomBytes(24);
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBe(24);
  });

  it('two calls return different bytes (overwhelmingly likely)', () => {
    const a = getRandomBytes(32);
    const b = getRandomBytes(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('rejects non-positive lengths', () => {
    expect(() => getRandomBytes(0)).toThrow();
    expect(() => getRandomBytes(-1)).toThrow();
    expect(() => getRandomBytes(1.5)).toThrow();
  });

  it('randomBase64 round-trips length', () => {
    const s = randomBase64(16);
    expect(base64Decode(s).length).toBe(16);
  });
});
