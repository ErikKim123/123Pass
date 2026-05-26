import { describe, expect, it } from 'vitest';

import {
  base64Decode,
  base64Encode,
  hexDecode,
  hexEncode,
  utf8Decode,
  utf8Encode,
} from '../src';

describe('base encoding helpers', () => {
  it('base64 round-trip', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    expect(Array.from(base64Decode(base64Encode(bytes)))).toEqual(Array.from(bytes));
  });

  it('hex round-trip', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    expect(hexEncode(bytes)).toBe('000102feff');
    expect(Array.from(hexDecode('000102feff'))).toEqual(Array.from(bytes));
  });

  it('utf8 round-trip preserves multibyte chars', () => {
    const s = '비밀번호 🔐 manager';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
  });
});
