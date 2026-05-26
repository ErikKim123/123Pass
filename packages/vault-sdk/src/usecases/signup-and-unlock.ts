// Design Ref: §2.2 — signup flow. Derives keys, generates ECDH keypair, creates user record.

import {
  base64Encode,
  deriveKeys,
  encrypt,
  generateKeyPair,
  getRandomBytes,
  publicKeyToBase64,
} from '@123pass/core-crypto';
import {
  ARGON2_MEMORY_COST,
  ARGON2_PARALLELISM,
  ARGON2_TIME_COST,
  SALT_LENGTH,
  type KdfParams,
} from '@123pass/shared';

import { VaultError } from '../domain/errors';

import type { UnlockedSession } from './unlock-vault';
import type { VaultRepository } from '../domain/repository';


export interface SignUpArgs {
  repo: VaultRepository;
  email: string;
  masterPassword: string;
  // Allow tests to inject lower KDF params.
  kdfOverrides?: { memoryCost?: number; timeCost?: number; parallelism?: number };
}

export async function signUpAndUnlock(args: SignUpArgs): Promise<UnlockedSession> {
  const { repo, email, masterPassword } = args;

  const memoryCost = args.kdfOverrides?.memoryCost ?? ARGON2_MEMORY_COST;
  const timeCost = args.kdfOverrides?.timeCost ?? ARGON2_TIME_COST;
  const parallelism = args.kdfOverrides?.parallelism ?? ARGON2_PARALLELISM;

  const saltAuthBytes = getRandomBytes(SALT_LENGTH);
  const saltVaultBytes = getRandomBytes(SALT_LENGTH);
  const saltAuth = base64Encode(saltAuthBytes);
  const saltVault = base64Encode(saltVaultBytes);

  const { authKey, vaultKey } = await deriveKeys({
    password: masterPassword,
    saltAuth: saltAuthBytes,
    saltVault: saltVaultBytes,
    memoryCost,
    timeCost,
    parallelism,
  });

  const authHash = base64Encode(authKey);

  // Create the auth.users row first.
  try {
    await repo.signUp(email, authHash);
  } catch (e) {
    throw new VaultError('REPOSITORY_ERROR', 'Failed to create auth user.', {
      cause: (e as Error).message,
    });
  }

  const userId = await repo.currentUserId();
  if (!userId) {
    throw new VaultError('AUTH_REQUIRED', 'Sign-up succeeded but session is missing.');
  }

  // Generate the user's ECDH keypair and wrap the private key under vaultKey.
  const keypair = generateKeyPair();
  const wrappedPriv = encrypt(vaultKey, keypair.privateKey);
  const kdfParams: KdfParams = {
    algorithm: 'argon2id',
    memoryCost,
    timeCost,
    parallelism,
    saltAuth,
    saltVault,
  };

  await repo.createUserRecord({
    id: userId,
    email,
    kdfParams,
    publicKey: publicKeyToBase64(keypair.publicKey),
    encryptedPrivateKey: {
      ciphertext: wrappedPriv.ciphertext,
      iv: wrappedPriv.iv,
      authTag: wrappedPriv.authTag,
    },
    recoveryEnabled: false,
  });

  return {
    userId,
    email,
    vaultKey,
    privateKey: keypair.privateKey,
    publicKey: keypair.publicKey,
  };
}
