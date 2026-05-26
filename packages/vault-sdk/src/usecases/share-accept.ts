// 1:1 share acceptance — recipient receives the sender's vault key via ECDH wrap.
// To make the shared item usable across sessions, the recipient COPIES it into their own vault
// (re-encrypted under their own vaultKey). This avoids mid-session key swapping.

import { decrypt, utf8Decode, utf8Encode, encrypt, deriveSearchKey, searchHash } from '@123pass/core-crypto';
import { assertNoPlaintextLeak, vaultItemPayloadSchema } from '@123pass/shared';

import { VaultError } from '../domain/errors';

import { unwrapSharedVaultKey } from './share-item';

import type { UnlockedSession } from './unlock-vault';
import type { VaultRepository, WrappedKey } from '../domain/repository';

/** Marks the share as accepted on the server side. */
export async function acceptShare(args: {
  repo: VaultRepository;
  shareId: string;
}): Promise<void> {
  await args.repo.acceptShare(args.shareId);
}

/**
 * Decrypt a shared item using the wrapped sender vault key, then copy it into the recipient's
 * own vault encrypted under their vaultKey. Returns the new item id.
 */
export async function openSharedItem(args: {
  repo: VaultRepository;
  session: UnlockedSession;
  shareId: string;
  itemId: string;
  wrappedKey: WrappedKey;
}): Promise<{ newItemId: string }> {
  const senderVaultKey = unwrapSharedVaultKey({
    session: args.session,
    wrappedKey: args.wrappedKey,
  });

  const senderRow = await args.repo.getItem(args.itemId);
  if (!senderRow) {
    throw new VaultError('ITEM_NOT_FOUND', `Shared item ${args.itemId} not found`);
  }

  // Decrypt using sender's vault key.
  const ptBytes = decrypt(senderVaultKey, {
    ciphertext: senderRow.ciphertext,
    iv: senderRow.iv,
    authTag: senderRow.auth_tag,
  });
  const payload = vaultItemPayloadSchema.parse(JSON.parse(utf8Decode(ptBytes)));

  // Re-encrypt under recipient's vault key.
  const reEncoded = utf8Encode(JSON.stringify(payload));
  const reEncrypted = encrypt(args.session.vaultKey, reEncoded);

  let hash: string | null = null;
  if (payload.url || payload.name) {
    const sk = deriveSearchKey(args.session.vaultKey);
    hash = searchHash(sk, (payload.url ?? '') + ' ' + payload.name);
  }

  const insertPayload = {
    ciphertext: reEncrypted.ciphertext,
    iv: reEncrypted.iv,
    authTag: reEncrypted.authTag,
    itemType: senderRow.item_type,
    searchHash: hash,
    folderId: null,
    favorite: false,
    version: 1,
  };
  assertNoPlaintextLeak(insertPayload as unknown as Record<string, unknown>);
  const inserted = await args.repo.insertItem(insertPayload);

  // Mark the share row as accepted.
  await args.repo.acceptShare(args.shareId);

  return { newItemId: inserted.id };
}
