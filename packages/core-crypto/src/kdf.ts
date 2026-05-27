// Design Ref: §7.3 — Argon2id key derivation. Two separate salts produce two
// independent keys: one for server authentication, one for vault encryption.
// Plan SC: <500ms on mobile; benchmark via vitest bench.

import { argon2id } from '@noble/hashes/argon2';

import {
  ARGON2_MEMORY_COST,
  ARGON2_OUTPUT_LENGTH,
  ARGON2_PARALLELISM,
  ARGON2_TIME_COST,
} from '@123pass/shared';

import { base64Decode, utf8Encode } from './base';
import { CryptoError, ERR_INVALID_INPUT, ERR_KDF_FAILED } from './errors';

export interface DerivedKeys {
  authKey: Uint8Array; // 32 bytes — sent to server as base64 (acts as the "password")
  vaultKey: Uint8Array; // 32 bytes — stays on device, encrypts vault
}

export interface DeriveKeysParams {
  password: string;
  saltAuth: Uint8Array | string; // base64 string accepted for convenience
  saltVault: Uint8Array | string;
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
}

function coerceSalt(salt: Uint8Array | string, name: string): Uint8Array {
  if (typeof salt === 'string') {
    try {
      return base64Decode(salt);
    } catch {
      throw new CryptoError(ERR_INVALID_INPUT, `${name} must be a valid base64 string`);
    }
  }
  if (!(salt instanceof Uint8Array)) {
    throw new CryptoError(ERR_INVALID_INPUT, `${name} must be a Uint8Array or base64 string`);
  }
  if (salt.length < 8) {
    throw new CryptoError(ERR_INVALID_INPUT, `${name} must be at least 8 bytes`);
  }
  return salt;
}

export interface DeriveSingleKeyParams {
  password: string;
  salt: Uint8Array | string;
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
}

/**
 * Derive a single 256-bit key from password + salt. Used by FR-15 export — the
 * export password is independent of the master password (domain separation by
 * having a separate salt for the export file).
 */
export function deriveSingleKey(params: DeriveSingleKeyParams): Uint8Array {
  const {
    password,
    salt,
    memoryCost = ARGON2_MEMORY_COST,
    timeCost = ARGON2_TIME_COST,
    parallelism = ARGON2_PARALLELISM,
  } = params;

  if (typeof password !== 'string' || password.length === 0) {
    throw new CryptoError(ERR_INVALID_INPUT, 'password must be a non-empty string');
  }
  const saltBytes = coerceSalt(salt, 'salt');
  const passwordBytes = utf8Encode(password);
  try {
    return argon2id(passwordBytes, saltBytes, {
      t: timeCost,
      m: memoryCost,
      p: parallelism,
      dkLen: ARGON2_OUTPUT_LENGTH,
    });
  } catch (e) {
    throw new CryptoError(
      ERR_KDF_FAILED,
      `Argon2id derivation failed: ${(e as Error).message ?? 'unknown'}`,
    );
  } finally {
    for (let i = 0; i < passwordBytes.length; i++) passwordBytes[i] = 0;
  }
}

export async function deriveKeys(params: DeriveKeysParams): Promise<DerivedKeys> {
  const {
    password,
    saltAuth,
    saltVault,
    memoryCost = ARGON2_MEMORY_COST,
    timeCost = ARGON2_TIME_COST,
    parallelism = ARGON2_PARALLELISM,
  } = params;

  if (typeof password !== 'string' || password.length === 0) {
    throw new CryptoError(ERR_INVALID_INPUT, 'password must be a non-empty string');
  }

  const passwordBytes = utf8Encode(password);
  const saltAuthBytes = coerceSalt(saltAuth, 'saltAuth');
  const saltVaultBytes = coerceSalt(saltVault, 'saltVault');

  try {
    // Two independent derivations — different salts guarantee domain separation.
    const authKey = argon2id(passwordBytes, saltAuthBytes, {
      t: timeCost,
      m: memoryCost,
      p: parallelism,
      dkLen: ARGON2_OUTPUT_LENGTH,
    });
    const vaultKey = argon2id(passwordBytes, saltVaultBytes, {
      t: timeCost,
      m: memoryCost,
      p: parallelism,
      dkLen: ARGON2_OUTPUT_LENGTH,
    });
    return { authKey, vaultKey };
  } catch (e) {
    throw new CryptoError(
      ERR_KDF_FAILED,
      `Argon2id derivation failed: ${(e as Error).message ?? 'unknown'}`,
    );
  } finally {
    // Best-effort wipe of the password material we copied into bytes.
    for (let i = 0; i < passwordBytes.length; i++) passwordBytes[i] = 0;
  }
}
