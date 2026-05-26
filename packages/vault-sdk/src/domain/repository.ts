// Design Ref: §9.1 — Repository Port. The only abstraction crossing the Supabase boundary.
// Mock implementation lives in test/repository-mock.ts; production lives in infrastructure/.

import type { KdfParams } from '@123pass/shared';

import type {
  EncryptedVaultItemRow,
  GroupItemsRow,
  GroupMembersRow,
  GroupsRow,
  ItemType,
  SharedItemsRow,
  UsersRow,
} from '../infrastructure/database.types';

export type WrappedKey = { ciphertext: string; iv: string; authTag: string; ephemeralPublicKey: string };

export interface UserRecord {
  id: string;
  email: string;
  kdfParams: KdfParams;
  publicKey: string;
  encryptedPrivateKey: { ciphertext: string; iv: string; authTag: string };
  recoveryEnabled: boolean;
}

export interface EncryptedItemInsert {
  ciphertext: string;
  iv: string;
  authTag: string;
  itemType: ItemType;
  searchHash: string | null;
  folderId: string | null;
  favorite: boolean;
  version: number;
}

export interface EncryptedItemUpdate {
  ciphertext: string;
  iv: string;
  authTag: string;
  searchHash: string | null;
  folderId?: string | null;
  favorite?: boolean;
  expectedVersion: number; // optimistic concurrency
  newVersion: number;
}

export interface ShareInsert {
  itemId: string;
  toUserId: string;
  wrappedKey: { ciphertext: string; iv: string; authTag: string; ephemeralPublicKey: string };
  permission: 'read' | 'write';
}

export interface RealtimeChange {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  row: EncryptedVaultItemRow;
}

export type RealtimeUnsubscribe = () => void;

/**
 * The only port through which vault-sdk talks to the outside world.
 * All adapters (Supabase, Mock) implement this interface.
 *
 * INVARIANT: implementations MUST NEVER see or accept plaintext credentials.
 * The only payload shape accepted is EncryptedItemInsert / EncryptedItemUpdate.
 */
export interface VaultRepository {
  // ---- Auth + user lifecycle ----
  signUp(email: string, authHash: string): Promise<{ userId: string }>;
  signIn(email: string, authHash: string): Promise<{ userId: string }>;
  signOut(): Promise<void>;
  currentUserId(): Promise<string | null>;

  // ---- User profile ----
  createUserRecord(record: UserRecord): Promise<void>;
  getUserRecord(userId: string): Promise<UserRecord | null>;
  getUserDirectoryEntry(
    email: string,
  ): Promise<{ id: string; email: string; publicKey: string } | null>;

  // ---- Vault items ----
  insertItem(payload: EncryptedItemInsert): Promise<EncryptedVaultItemRow>;
  updateItem(id: string, payload: EncryptedItemUpdate): Promise<EncryptedVaultItemRow>;
  deleteItem(id: string): Promise<void>;
  listItems(options?: { limit?: number; afterUpdatedAt?: string }): Promise<EncryptedVaultItemRow[]>;
  getItem(id: string): Promise<EncryptedVaultItemRow | null>;

  // ---- Sharing (1:1) ----
  insertShare(payload: ShareInsert): Promise<SharedItemsRow>;
  listIncomingShares(): Promise<SharedItemsRow[]>;
  acceptShare(shareId: string): Promise<SharedItemsRow>;
  deleteShare(shareId: string): Promise<void>;

  // ---- Groups (family / team) ----
  createGroup(args: {
    name: string;
    ownerWrappedGroupKey: WrappedKey;
  }): Promise<{ group: GroupsRow; member: GroupMembersRow }>;
  listGroups(): Promise<Array<{ group: GroupsRow; member: GroupMembersRow }>>;
  getGroup(groupId: string): Promise<GroupsRow | null>;
  getGroupMember(groupId: string, userId: string): Promise<GroupMembersRow | null>;
  listGroupMembers(groupId: string): Promise<GroupMembersRow[]>;
  inviteGroupMember(args: {
    groupId: string;
    userId: string;
    role: 'admin' | 'member';
    wrappedGroupKey: WrappedKey;
  }): Promise<GroupMembersRow>;
  removeGroupMember(groupId: string, userId: string): Promise<void>;

  // ---- Group vault items ----
  insertGroupItem(args: {
    groupId: string;
    ciphertext: string;
    iv: string;
    authTag: string;
    itemType: ItemType;
    version: number;
  }): Promise<GroupItemsRow>;
  listGroupItems(groupId: string): Promise<GroupItemsRow[]>;
  deleteGroupItem(itemId: string): Promise<void>;

  // ---- Master password rotation ----
  rotateMasterPassword(args: {
    newKdfParams: UsersRow['kdf_params'];
    newEncryptedPrivateKey: UsersRow['encrypted_private_key'];
    newItems: Array<{
      id: string;
      ciphertext: string;
      iv: string;
      authTag: string;
      version: number;
    }>;
  }): Promise<void>;

  // ---- Realtime ----
  subscribeItems(onChange: (change: RealtimeChange) => void): RealtimeUnsubscribe;
}
