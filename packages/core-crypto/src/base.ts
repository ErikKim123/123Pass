// Base64 / hex helpers — backed by @scure/base for cross-platform parity.

import { base64, hex, utf8 } from '@scure/base';

export function base64Encode(bytes: Uint8Array): string {
  return base64.encode(bytes);
}

export function base64Decode(s: string): Uint8Array {
  return base64.decode(s);
}

export function hexEncode(bytes: Uint8Array): string {
  return hex.encode(bytes);
}

export function hexDecode(s: string): Uint8Array {
  return hex.decode(s);
}

export function utf8Encode(s: string): Uint8Array {
  return utf8.decode(s);
}

export function utf8Decode(bytes: Uint8Array): string {
  return utf8.encode(bytes);
}
