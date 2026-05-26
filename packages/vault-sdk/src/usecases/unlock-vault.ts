// Design Ref: §2.2 step 1-5 — derive keys, sign in, fetch user record, unwrap private key.

import {
  base64Encode,
  decrypt,
  deriveKeys,
  publicKeyFromBase64,
} from '@123pass/core-crypto';

import { VaultError } from '../domain/errors';

import type { VaultRepository } from '../domain/repository';

export interface UnlockedSession {
  userId: string;
  email: string;
  vaultKey: Uint8Array; // 32 bytes — in-memory only
  privateKey: Uint8Array; // ECDH P-256 — in-memory only
  publicKey: Uint8Array;
}

export interface KnownKdfUnlockArgs {
  repo: VaultRepository;
  email: string;
  masterPassword: string;
  kdfParams: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
    saltAuth: string;
    saltVault: string;
  };
}

/**
 * Unlock when KDF params are already known (cached locally OR fetched from an unauthenticated
 * lookup endpoint). This is the primary path for repeat logins on a known device.
 */
export async function unlockWithKdfParams(args: KnownKdfUnlockArgs): Promise<UnlockedSession> {
  const { repo, email, masterPassword, kdfParams } = args;

  const { authKey, vaultKey } = await deriveKeys({
    password: masterPassword,
    saltAuth: kdfParams.saltAuth,
    saltVault: kdfParams.saltVault,
    memoryCost: kdfParams.memoryCost,
    timeCost: kdfParams.timeCost,
    parallelism: kdfParams.parallelism,
  });

  // authKey is sent base64-encoded as the "password" to Supabase Auth.
  const authHash = base64Encode(authKey);

  try {
    await repo.signIn(email, authHash);
  } catch (e) {
    throw new VaultError(
      'AUTH_INVALID_CREDENTIALS',
      'Email or master password is incorrect.',
      { cause: (e as Error).message },
    );
  }

  const userId = await repo.currentUserId();
  if (!userId) {
    throw new VaultError('AUTH_REQUIRED', 'Sign-in succeeded but session is missing.');
  }
  const profile = await repo.getUserRecord(userId);
  if (!profile) {
    throw new VaultError('AUTH_REQUIRED', 'User profile not found.');
  }

  // Unwrap the ECDH private key with vaultKey.
  let privateKey: Uint8Array;
  try {
    privateKey = decrypt(vaultKey, {
      ciphertext: profile.encryptedPrivateKey.ciphertext,
      iv: profile.encryptedPrivateKey.iv,
      authTag: profile.encryptedPrivateKey.authTag,
    });
  } catch (e) {
    throw new VaultError(
      'AUTH_INVALID_CREDENTIALS',
      'Failed to unwrap private key — master password likely incorrect.',
      { cause: (e as Error).message },
    );
  }

  return {
    userId: profile.id,
    email: profile.email,
    vaultKey,
    privateKey,
    publicKey: publicKeyFromBase64(profile.publicKey),
  };
}
