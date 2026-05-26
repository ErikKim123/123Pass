// SHA-1 (only for the HIBP API, which mandates SHA-1 — DO NOT use for security-critical paths).

import { sha1 } from '@noble/hashes/sha1';

import { hexEncode, utf8Encode } from './base';

export async function sha1Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? utf8Encode(data) : data;
  // Prefer SubtleCrypto when available (faster). Probe via duck-typing so the polyfilled
  // mobile globalThis.crypto (which has no .subtle) still hits the noble fallback path.
  type DigestFn = (alg: string, data: ArrayBufferLike) => Promise<ArrayBuffer>;
  const subtle = (
    globalThis as { crypto?: { subtle?: { digest?: DigestFn } } }
  ).crypto?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const buf = await subtle.digest('SHA-1', copy.buffer);
    return hexEncode(new Uint8Array(buf));
  }
  return hexEncode(sha1(bytes));
}
