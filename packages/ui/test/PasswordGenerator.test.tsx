import { describe, expect, it } from 'vitest';

import { generatePassword } from '../src';

describe('generatePassword', () => {
  it('returns a password of the exact requested length', () => {
    const pw = generatePassword({ length: 24, lower: true, upper: true, digit: true, symbol: true });
    expect(pw).toHaveLength(24);
  });

  it('contains only the requested character classes', () => {
    const pw = generatePassword({ length: 64, lower: true, upper: false, digit: false, symbol: false });
    expect(pw).toMatch(/^[a-z]+$/);
  });

  it('returns empty string when no charset is selected', () => {
    const pw = generatePassword({ length: 24, lower: false, upper: false, digit: false, symbol: false });
    expect(pw).toBe('');
  });

  it('two consecutive calls (overwhelmingly) differ', () => {
    const a = generatePassword({ length: 32, lower: true, upper: true, digit: true, symbol: true });
    const b = generatePassword({ length: 32, lower: true, upper: true, digit: true, symbol: true });
    expect(a).not.toBe(b);
  });

  it('digits-only generator stays within 0-9', () => {
    const pw = generatePassword({ length: 100, lower: false, upper: false, digit: true, symbol: false });
    expect(pw).toMatch(/^\d{100}$/);
  });
});
