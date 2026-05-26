// Design Ref: §FR-13 / §4.3 — atomic master password rotation.
// Re-encrypt every vault item locally under the new vaultKey, then issue ONE RPC call.

import {
  base64Encode,
  decrypt,
  deriveKeys,
  encrypt,
  getRandomBytes,
  utf8Decode,
} from '@123pass/core-crypto';
import { SALT_LENGTH, vaultItemPayloadSchema, type KdfParams } from '@123pass/shared';

import { VaultError } from '../domain/errors';

import type { UnlockedSession } from './unlock-vault';
import type { VaultRepository } from '../domain/repository';


export interface RotateArgs {
  repo: VaultRepository;
  session: UnlockedSession;
  newMasterPassword: string;
  kdfOverrides?: { memoryCost?: number; timeCost?: number; parallelism?: number };
}

export interface RotateResult {
  newSession: UnlockedSession;
  reEncryptedCount: number;
}

export async function rotateMasterPassword(args: RotateArgs): Promise<RotateResult> {
  const memoryCost = args.kdfOverrides?.memoryCost ?? 8192; // tests use low params by default
  const timeCost = args.kdfOverrides?.timeCost ?? 1;
  const parallelism = args.kdfOverrides?.parallelism ?? 1;

  const saltAuthBytes = getRandomBytes(SALT_LENGTH);
  const saltVaultBytes = getRandomBytes(SALT_LENGTH);

  const { authKey: _newAuthKey, vaultKey: newVaultKey } = await deriveKeys({
    password: args.newMasterPassword,
    saltAuth: saltAuthBytes,
    saltVault: saltVaultBytes,
    memoryCost,
    timeCost,
    parallelism,
  });

  // 1) Re-wrap the user's ECDH private key under the new vault key.
  const wrappedPriv = encrypt(newVaultKey, args.session.privateKey);

  // 2) Read every item, decrypt with the OLD vaultKey, re-encrypt with the new vault key.
  const rows = await args.repo.listItems();
  const newItems: Array<{
    id: string;
    ciphertext: string;
    iv: string;
    authTag: string;
    version: number;
  }> = [];
  for (const row of rows) {
    let plaintext: Uint8Array;
    try {
      plaintext = decrypt(args.session.vaultKey, {
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      });
    } catch {
      throw new VaultError(
        'REPOSITORY_ERROR',
        `Failed to decrypt item ${row.id} during rotation — aborted`,
      );
    }
    // Defensive parse — never re-encrypt unparseable data.
    vaultItemPayloadSchema.parse(JSON.parse(utf8Decode(plaintext)));
    const reEnc = encrypt(newVaultKey, plaintext);
    newItems.push({
      id: row.id,
      ciphertext: reEnc.ciphertext,
      iv: reEnc.iv,
      authTag: reEnc.authTag,
      version: row.version + 1,
    });
  }

  const newKdfParams: KdfParams = {
    algorithm: 'argon2id',
    memoryCost,
    timeCost,
    parallelism,
    saltAuth: base64Encode(saltAuthBytes),
    saltVault: base64Encode(saltVaultBytes),
  };

  await args.repo.rotateMasterPassword({
    newKdfParams,
    newEncryptedPrivateKey: {
      ciphertext: wrappedPriv.ciphertext,
      iv: wrappedPriv.iv,
      authTag: wrappedPriv.authTag,
    },
    newItems,
  });

  return {
    newSession: { ...args.session, vaultKey: newVaultKey },
    reEncryptedCount: newItems.length,
  };
}

