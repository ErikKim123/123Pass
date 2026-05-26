import { describe, expect, it } from 'vitest';

import { CryptoError, totp, totpRemainingSeconds } from '../src';

import vectors from './vectors/rfc6238-totp.json' with { type: 'json' };

describe('TOTP (RFC 6238)', () => {
  for (const v of vectors) {
    it(v.name, () => {
      const code = totp(v.secretBase32, {
        algorithm: v.algorithm as 'SHA1' | 'SHA256' | 'SHA512',
        digits: v.digits,
        now: v.time,
      });
      expect(code).toBe(v.expected);
    });
  }

  it('truncates to N digits', () => {
    const code6 = totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', { digits: 6, now: 59 });
    const code8 = totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', { digits: 8, now: 59 });
    expect(code6).toHaveLength(6);
    expect(code8).toHaveLength(8);
    // The last 6 digits of the 8-digit code equal the 6-digit code.
    expect(code8.slice(-6)).toBe(code6);
  });

  it('changes value when the time step advances', () => {
    const a = totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', { now: 1_000_000_000 });
    const b = totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', { now: 1_000_000_000 + 30 });
    expect(a).not.toBe(b);
  });

  it('rejects malformed base32', () => {
    expect(() => totp('not base32!', { now: 0 })).toThrow(CryptoError);
  });

  it('rejects out-of-range digits', () => {
    expect(() => totp('GEZDGNBVGY3TQOJQ', { digits: 5, now: 0 })).toThrow(/6-8/);
    expect(() => totp('GEZDGNBVGY3TQOJQ', { digits: 9, now: 0 })).toThrow(/6-8/);
  });

  it('rejects non-positive period', () => {
    expect(() => totp('GEZDGNBVGY3TQOJQ', { period: 0, now: 0 })).toThrow(/period must be/);
  });

  it('remaining seconds is within (0, period]', () => {
    expect(totpRemainingSeconds(30, 0)).toBe(30);
    expect(totpRemainingSeconds(30, 15)).toBe(15);
    expect(totpRemainingSeconds(30, 29)).toBe(1);
  });
});
