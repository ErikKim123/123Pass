// Design Ref: §FR-11 / §7.3 — 1:1 sharing. Sender wraps the item's symmetric key under the
// recipient's ECDH public key using an ephemeral keypair (PFS).

import {
  decrypt,
  deriveSharedKey,
  encrypt,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64,
} from '@123pass/core-crypto';
import { HKDF_INFO_WRAP, type WrappedKey } from '@123pass/shared';

import { VaultError } from '../domain/errors';

import type { UnlockedSession } from './unlock-vault';
import type { ShareInsert, VaultRepository } from '../domain/repository';


export interface ShareItemArgs {
  repo: VaultRepository;
  session: UnlockedSession;
  itemId: string;
  recipientEmail: string;
  permission: 'read' | 'write';
}

export async function shareItem(args: ShareItemArgs): Promise<void> {
  const recipient = await args.repo.getUserDirectoryEntry(args.recipientEmail);
  if (!recipient) {
    throw new VaultError(
      'SHARE_RECIPIENT_NOT_FOUND',
      `Recipient ${args.recipientEmail} not found`,
    );
  }

  const item = await args.repo.getItem(args.itemId);
  if (!item) throw new VaultError('ITEM_NOT_FOUND', `Item ${args.itemId} not found`);

  // Generate an ephemeral sender keypair (PFS — Plan §7.1 V6.2.6).
  const ephemeral = generateKeyPair();
  const recipientPub = publicKeyFromBase64(recipient.publicKey);
  const wrapKey = deriveSharedKey({
    privateKey: ephemeral.privateKey,
    peerPublicKey: recipientPub,
    info: HKDF_INFO_WRAP,
  });
  const wrapped = encrypt(wrapKey, args.session.vaultKey);

  const payload: ShareInsert = {
    itemId: args.itemId,
    toUserId: recipient.id,
    wrappedKey: {
      ciphertext: wrapped.ciphertext,
      iv: wrapped.iv,
      authTag: wrapped.authTag,
      ephemeralPublicKey: publicKeyToBase64(ephemeral.publicKey),
    },
    permission: args.permission,
  };
  await args.repo.insertShare(payload);
}

/**
 * Recipient side: derive the shared key with the sender's ephemeral public key,
 * then unwrap the sender's vault key.
 */
export function unwrapSharedVaultKey(args: {
  session: UnlockedSession;
  wrappedKey: WrappedKey;
}): Uint8Array {
  const wrapKey = deriveSharedKey({
    privateKey: args.session.privateKey,
    peerPublicKey: publicKeyFromBase64(args.wrappedKey.ephemeralPublicKey),
    info: HKDF_INFO_WRAP,
  });
  return decrypt(wrapKey, {
    ciphertext: args.wrappedKey.ciphertext,
    iv: args.wrappedKey.iv,
    authTag: args.wrappedKey.authTag,
  });
}
