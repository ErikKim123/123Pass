// Have I Been Pwned k-anonymity check.
// Privacy model: client sends only the first 5 hex chars of SHA-1(password), HIBP responds
// with every matching suffix + count. Client matches locally — full hash never leaves the device.
// https://haveibeenpwned.com/API/v3#PwnedPasswords

import { sha1Hex } from '@123pass/core-crypto';

export interface PwnedHit {
  suffix: string; // 35 uppercase hex chars
  count: number;
}

/**
 * SHA-1 the given password and return uppercase hex.
 * SHA-1 is required by the HIBP API; do NOT use it for anything security-critical elsewhere.
 */
export async function sha1HexOfPassword(password: string): Promise<string> {
  return (await sha1Hex(password)).toUpperCase();
}

/**
 * Fetch the HIBP range for the 5-character prefix.
 * Returns up to ~500 (suffix, count) pairs the caller filters locally.
 */
export async function fetchPwnedRange(prefix: string): Promise<PwnedHit[]> {
  if (!/^[0-9A-F]{5}$/.test(prefix)) {
    throw new Error('HIBP prefix must be 5 uppercase hex chars');
  }
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true' }, // anti-traffic-analysis padding
  });
  if (!res.ok) {
    throw new Error(`HIBP API returned ${res.status}`);
  }
  const text = await res.text();
  const hits: PwnedHit[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [suffix, countStr] = trimmed.split(':');
    if (!suffix || !countStr) continue;
    const count = Number.parseInt(countStr, 10);
    if (count > 0) hits.push({ suffix, count });
  }
  return hits;
}

/**
 * Convenience: run the full check for one password.
 * Returns 0 if the password has never appeared in known breaches.
 */
export async function checkPwnedRange(password: string): Promise<number> {
  const hash = await sha1HexOfPassword(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const range = await fetchPwnedRange(prefix);
  return range.find((r) => r.suffix === suffix)?.count ?? 0;
}
