// Design Ref: §3.1 — sharing entities. Wrapped keys carry the recipient-specific encryption.

import type { EncryptedBlob } from './vault';

export interface WrappedKey {
  ciphertext: string; // base64 — wrapped symmetric key (AES-256-GCM)
  iv: string; // base64
  authTag: string; // base64 — 16-byte GCM auth tag (required for integrity)
  ephemeralPublicKey: string; // base64 — ECDH ephemeral pubkey
}

export type SharePermission = 'read' | 'write';

export interface SharedItem {
  id: string;
  itemId: string;
  fromUserId: string;
  toUserId: string;
  wrappedKey: WrappedKey;
  permission: SharePermission;
  createdAt: string;
  acceptedAt: string | null;
}

export type GroupRole = 'owner' | 'admin' | 'member';

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  role: GroupRole;
  wrappedGroupKey: WrappedKey;
  joinedAt: string;
}

export interface GroupItem extends EncryptedBlob {
  id: string;
  groupId: string;
  itemType: string;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
