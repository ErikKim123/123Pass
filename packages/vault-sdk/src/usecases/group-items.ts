// Group vault items — encrypted with the group master key (shared symmetric).

import { decrypt, encrypt, utf8Decode, utf8Encode } from '@123pass/core-crypto';
import {
  assertNoPlaintextLeak,
  vaultItemPayloadSchema,
  type VaultItemPayload,
  type VaultItemType,
} from '@123pass/shared';

import type { VaultRepository } from '../domain/repository';

export interface DecryptedGroupItem {
  id: string;
  groupId: string;
  itemType: VaultItemType;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  payload: VaultItemPayload;
}

export interface AddItemToGroupArgs {
  repo: VaultRepository;
  groupId: string;
  groupKey: Uint8Array;
  payload: VaultItemPayload;
  itemType: VaultItemType;
}

export async function addItemToGroup(args: AddItemToGroupArgs): Promise<DecryptedGroupItem> {
  const payload = vaultItemPayloadSchema.parse(args.payload);
  const plaintext = utf8Encode(JSON.stringify(payload));
  const blob = encrypt(args.groupKey, plaintext);

  const insertPayload = {
    groupId: args.groupId,
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    authTag: blob.authTag,
    itemType: args.itemType as VaultItemType,
    version: 1,
  };
  assertNoPlaintextLeak(insertPayload as unknown as Record<string, unknown>);

  const row = await args.repo.insertGroupItem(insertPayload);
  return {
    id: row.id,
    groupId: row.group_id,
    itemType: row.item_type as VaultItemType,
    createdBy: row.created_by,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload,
  };
}

export interface ListGroupItemsArgs {
  repo: VaultRepository;
  groupId: string;
  groupKey: Uint8Array;
}

export async function listGroupItems(args: ListGroupItemsArgs): Promise<DecryptedGroupItem[]> {
  const rows = await args.repo.listGroupItems(args.groupId);
  const out: DecryptedGroupItem[] = [];
  for (const row of rows) {
    try {
      const ptBytes = decrypt(args.groupKey, {
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      });
      const payload = vaultItemPayloadSchema.parse(JSON.parse(utf8Decode(ptBytes)));
      out.push({
        id: row.id,
        groupId: row.group_id,
        itemType: row.item_type as VaultItemType,
        createdBy: row.created_by,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        payload,
      });
    } catch {
      // Skip items we cannot decrypt — group key may be stale after a rotation.
    }
  }
  return out;
}
