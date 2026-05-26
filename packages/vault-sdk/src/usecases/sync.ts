// Design Ref: §2.2 step 10-11 — Realtime subscription. Each remote change is decrypted locally.

import { decrypt, utf8Decode } from '@123pass/core-crypto';
import { vaultItemPayloadSchema } from '@123pass/shared';


import type { DecryptedItem } from './item-crud';
import type { UnlockedSession } from './unlock-vault';
import type { RealtimeChange, VaultRepository } from '../domain/repository';

export type SyncEventType = 'insert' | 'update' | 'delete';

export interface SyncEvent {
  type: SyncEventType;
  itemId: string;
  item?: DecryptedItem; // decrypted when present
}

export function subscribeSync(
  repo: VaultRepository,
  session: UnlockedSession,
  onEvent: (event: SyncEvent) => void,
): () => void {
  return repo.subscribeItems((change: RealtimeChange) => {
    if (change.type === 'DELETE') {
      onEvent({ type: 'delete', itemId: change.row.id });
      return;
    }
    try {
      const pt = decrypt(session.vaultKey, {
        ciphertext: change.row.ciphertext,
        iv: change.row.iv,
        authTag: change.row.auth_tag,
      });
      const payload = vaultItemPayloadSchema.parse(JSON.parse(utf8Decode(pt)));
      const item: DecryptedItem = {
        id: change.row.id,
        itemType: change.row.item_type,
        favorite: change.row.favorite,
        folderId: change.row.folder_id,
        version: change.row.version,
        createdAt: change.row.created_at,
        updatedAt: change.row.updated_at,
        payload,
      };
      onEvent({
        type: change.type === 'INSERT' ? 'insert' : 'update',
        itemId: change.row.id,
        item,
      });
    } catch {
      // Item we cannot decrypt is silently dropped from the live view (Design §6.3).
    }
  });
}
