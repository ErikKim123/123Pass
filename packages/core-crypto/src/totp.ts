// Design Ref: §FR-09 — RFC 6238 TOTP. Secret is stored encrypted in the vault;
// codes are generated client-side after vault unlock.

import { hmac } from '@noble/hashes/hmac';
import { sha1 } from '@noble/hashes/sha1';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { base32 } from '@scure/base';

import { TOTP_DIGITS, TOTP_PERIOD_SECONDS } from '@123pass/shared';

import { CryptoError, ERR_INVALID_INPUT } from './errors';

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface TotpOptions {
  digits?: number;
  period?: number;
  algorithm?: TotpAlgorithm;
  /** Unix epoch seconds. Defaults to Date.now() / 1000. */
  now?: number;
}

const algoMap = { SHA1: sha1, SHA256: sha256, SHA512: sha512 } as const;

function decodeBase32Secret(secret: string): Uint8Array {
  const cleaned = secret.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z2-7]+=*$/.test(cleaned)) {
    throw new CryptoError(ERR_INVALID_INPUT, 'TOTP secret must be base32');
  }
  return base32.decode(cleaned);
}

function intToCounterBuf(counter: number): Uint8Array {
  // 8-byte big-endian counter per RFC 4226 §5.1.
  const buf = new Uint8Array(8);
  let n = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return buf;
}

export function totp(secretBase32: string, options: TotpOptions = {}): string {
  const digits = options.digits ?? TOTP_DIGITS;
  const period = options.period ?? TOTP_PERIOD_SECONDS;
  const algorithm = options.algorithm ?? 'SHA1';
  const now = options.now ?? Math.floor(Date.now() / 1000);

  if (digits < 6 || digits > 8) {
    throw new CryptoError(ERR_INVALID_INPUT, 'TOTP digits must be 6-8');
  }
  if (period <= 0) {
    throw new CryptoError(ERR_INVALID_INPUT, 'TOTP period must be > 0');
  }

  const key = decodeBase32Secret(secretBase32);
  const counter = Math.floor(now / period);
  const counterBuf = intToCounterBuf(counter);
  const hashFn = algoMap[algorithm];
  const mac = hmac(hashFn, key, counterBuf);

  // Dynamic truncation — RFC 4226 §5.3.
  const lastByte = mac[mac.length - 1];
  if (lastByte === undefined) {
    throw new CryptoError(ERR_INVALID_INPUT, 'HMAC output unexpectedly empty');
  }
  const offset = lastByte & 0x0f;
  const b0 = mac[offset] ?? 0;
  const b1 = mac[offset + 1] ?? 0;
  const b2 = mac[offset + 2] ?? 0;
  const b3 = mac[offset + 3] ?? 0;
  const binCode = ((b0 & 0x7f) << 24) | ((b1 & 0xff) << 16) | ((b2 & 0xff) << 8) | (b3 & 0xff);
  const mod = 10 ** digits;
  return String(binCode % mod).padStart(digits, '0');
}

export function totpRemainingSeconds(period = TOTP_PERIOD_SECONDS, now?: number): number {
  const t = now ?? Math.floor(Date.now() / 1000);
  return period - (t % period);
}
