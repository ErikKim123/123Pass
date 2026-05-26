import { describe, expect, it } from 'vitest';

import { base64Encode, deriveKeys, getRandomBytes } from '../src';

describe('deriveKeys (Argon2id)', () => {
  // Plan SC: keep test cost low — production parameters benchmark in `bench`.
  const fastParams = { memoryCost: 8192, timeCost: 1, parallelism: 1 } as const;

  it('returns two 32-byte keys', async () => {
    const salt = getRandomBytes(16);
    const { authKey, vaultKey } = await deriveKeys({
      password: 'correct horse battery staple',
      saltAuth: salt,
      saltVault: salt,
      ...fastParams,
    });
    expect(authKey).toBeInstanceOf(Uint8Array);
    expect(vaultKey).toBeInstanceOf(Uint8Array);
    expect(authKey.length).toBe(32);
    expect(vaultKey.length).toBe(32);
  });

  it('produces different keys for different salts (domain separation)', async () => {
    const result = await deriveKeys({
      password: 'pw',
      saltAuth: getRandomBytes(16),
      saltVault: getRandomBytes(16),
      ...fastParams,
    });
    expect(base64Encode(result.authKey)).not.toEqual(base64Encode(result.vaultKey));
  });

  it('is deterministic for fixed inputs', async () => {
    const saltAuth = new Uint8Array(16).fill(1);
    const saltVault = new Uint8Array(16).fill(2);
    const a = await deriveKeys({ password: 'pw', saltAuth, saltVault, ...fastParams });
    const b = await deriveKeys({ password: 'pw', saltAuth, saltVault, ...fastParams });
    expect(base64Encode(a.authKey)).toEqual(base64Encode(b.authKey));
    expect(base64Encode(a.vaultKey)).toEqual(base64Encode(b.vaultKey));
  });

  it('rejects empty password', async () => {
    await expect(
      deriveKeys({ password: '', saltAuth: getRandomBytes(16), saltVault: getRandomBytes(16) }),
    ).rejects.toThrow(/non-empty string/);
  });

  it('rejects short salt', async () => {
    await expect(
      deriveKeys({ password: 'pw', saltAuth: new Uint8Array(4), saltVault: getRandomBytes(16) }),
    ).rejects.toThrow(/at least 8 bytes/);
  });

  it('accepts base64 salt strings', async () => {
    const salt = base64Encode(getRandomBytes(16));
    const out = await deriveKeys({
      password: 'pw',
      saltAuth: salt,
      saltVault: salt,
      ...fastParams,
    });
    expect(out.authKey.length).toBe(32);
  });

  it('rejects invalid base64 salt', async () => {
    await expect(
      deriveKeys({
        password: 'pw',
        saltAuth: '!!!not base64!!!',
        saltVault: '!!!not base64!!!',
        ...fastParams,
      }),
    ).rejects.toThrow(/base64/);
  });

  it('rejects non-Uint8Array / non-string salt', async () => {
    await expect(
      deriveKeys({
        password: 'pw',
        // @ts-expect-error — intentionally wrong type at the boundary
        saltAuth: 12345,
        saltVault: getRandomBytes(16),
        ...fastParams,
      }),
    ).rejects.toThrow(/Uint8Array or base64 string/);
  });
});
