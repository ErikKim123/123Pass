// Design Ref: §2.2 step 6-10 — CRUD operations. ENCRYPTION HAPPENS HERE, NOWHERE ELSE.
// Every payload going to the Repository is ciphertext + iv + authTag.

import {
  decrypt,
  deriveSearchKey,
  encrypt,
  searchHash as computeSearchHash,
  utf8Decode,
  utf8Encode,
} from '@123pass/core-crypto';
import {
  assertNoPlaintextLeak,
  vaultItemPayloadSchema,
  type VaultItemPayload,
  type VaultItemType,
} from '@123pass/shared';

import { VaultError } from '../domain/errors';

import type { UnlockedSession } from './unlock-vault';
import type { VaultRepository } from '../domain/repository';


export interface DecryptedItem {
  id: string;
  itemType: VaultItemType;
  favorite: boolean;
  folderId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  payload: VaultItemPayload;
}

function inferSearchInput(payload: VaultItemPayload): string | null {
  // Build a stable searchable string from url + name. If neither is meaningful, return null.
  const parts = [payload.url, payload.name].filter((p): p is string => !!p && p.length > 0);
  if (parts.length === 0) return null;
  return parts.join(' ');
}

export async function createItem(
  repo: VaultRepository,
  session: UnlockedSession,
  payloadInput: VaultItemPayload,
  itemType: VaultItemType,
  options?: { folderId?: string | null; favorite?: boolean },
): Promise<DecryptedItem> {
  const payload = vaultItemPayloadSchema.parse(payloadInput);

  const plaintext = utf8Encode(JSON.stringify(payload));
  const blob = encrypt(session.vaultKey, plaintext);

  let hash: string | null = null;
  const searchInput = inferSearchInput(payload);
  if (searchInput) {
    const searchKey = deriveSearchKey(session.vaultKey);
    hash = computeSearchHash(searchKey, searchInput);
  }

  const insertPayload = {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    authTag: blob.authTag,
    itemType,
    searchHash: hash,
    folderId: options?.folderId ?? null,
    favorite: options?.favorite ?? false,
    version: 1,
  };

  // Zero-knowledge guard — last line of defence against accidental plaintext leaks.
  assertNoPlaintextLeak(insertPayload as unknown as Record<string, unknown>);

  const row = await repo.insertItem(insertPayload);
  return {
    id: row.id,
    itemType: row.item_type,
    favorite: row.favorite,
    folderId: row.folder_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload,
  };
}

export async function readItem(
  repo: VaultRepository,
  session: UnlockedSession,
  itemId: string,
): Promise<DecryptedItem> {
  const row = await repo.getItem(itemId);
  if (!row) throw new VaultError('ITEM_NOT_FOUND', `Item ${itemId} not found`);
  const ptBytes = decrypt(session.vaultKey, {
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
  });
  const payload = vaultItemPayloadSchema.parse(JSON.parse(utf8Decode(ptBytes)));
  return {
    id: row.id,
    itemType: row.item_type,
    favorite: row.favorite,
    folderId: row.folder_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload,
  };
}

export async function listItems(
  repo: VaultRepository,
  session: UnlockedSession,
): Promise<DecryptedItem[]> {
  const rows = await repo.listItems();
  const out: DecryptedItem[] = [];
  for (const row of rows) {
    try {
      const ptBytes = decrypt(session.vaultKey, {
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      });
      const payload = vaultItemPayloadSchema.parse(JSON.parse(utf8Decode(ptBytes)));
      out.push({
        id: row.id,
        itemType: row.item_type,
        favorite: row.favorite,
        folderId: row.folder_id,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        payload,
      });
    } catch {
      // Isolate the broken item; the rest of the vault remains usable.
      // Design Ref: §6.3 — single-item decrypt failure does not lock the vault.
    }
  }
  return out;
}

export async function updateItem(
  repo: VaultRepository,
  session: UnlockedSession,
  itemId: string,
  newPayloadInput: VaultItemPayload,
  expectedVersion: number,
  options?: { folderId?: string | null; favorite?: boolean },
): Promise<DecryptedItem> {
  const payload = vaultItemPayloadSchema.parse(newPayloadInput);

  const plaintext = utf8Encode(JSON.stringify(payload));
  const blob = encrypt(session.vaultKey, plaintext);

  let hash: string | null = null;
  const searchInput = inferSearchInput(payload);
  if (searchInput) {
    const searchKey = deriveSearchKey(session.vaultKey);
    hash = computeSearchHash(searchKey, searchInput);
  }

  const updatePayload = {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    authTag: blob.authTag,
    searchHash: hash,
    folderId: options?.folderId,
    favorite: options?.favorite,
    expectedVersion,
    newVersion: expectedVersion + 1,
  };

  assertNoPlaintextLeak(updatePayload as unknown as Record<string, unknown>);

  const row = await repo.updateItem(itemId, updatePayload);
  return {
    id: row.id,
    itemType: row.item_type,
    favorite: row.favorite,
    folderId: row.folder_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload,
  };
}

export async function deleteItem(repo: VaultRepository, itemId: string): Promise<void> {
  await repo.deleteItem(itemId);
}

export function searchItems(
  _session: UnlockedSession,
  items: DecryptedItem[],
  query: string,
): DecryptedItem[] {
  // Local filter after decryption — Repository never sees the query.
  const q = query.trim().toLowerCase().normalize('NFKC');
  if (!q) return items;
  return items.filter((it) => {
    const hay = [it.payload.name, it.payload.url, it.payload.username, ...(it.payload.tags ?? [])]
      .filter((x): x is string => !!x)
      .join(' ')
      .toLowerCase()
      .normalize('NFKC');
    return hay.includes(q);
  });
}

export function searchHashForQuery(session: UnlockedSession, query: string): string {
  const searchKey = deriveSearchKey(session.vaultKey);
  return computeSearchHash(searchKey, query);
}
