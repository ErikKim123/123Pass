// In-memory VaultRepository for unit tests.
// MUST exhibit the same zero-knowledge contract as the production Supabase adapter:
//   - the only insert/update shape accepted is ciphertext + iv + authTag.

import type {
  AuthSession,
  AuthStateChange,
  AuthUnsubscribe,
  EncryptedItemInsert,
  EncryptedItemUpdate,
  RealtimeChange,
  RealtimeUnsubscribe,
  ShareInsert,
  UserRecord,
  VaultRepository,
  WrappedKey,
} from '../src/domain/repository';
import type {
  EncryptedVaultItemRow,
  GroupItemsRow,
  GroupMembersRow,
  GroupsRow,
  ItemType,
  SharedItemsRow,
  UsersRow,
} from '../src/infrastructure/database.types';

interface AuthUser {
  id: string;
  email: string;
  authHash: string;
}

let idCounter = 1;
const uuid = (): string =>
  `00000000-0000-0000-0000-${String(idCounter++).padStart(12, '0')}`;

export class InMemoryRepository implements VaultRepository {
  private authUsers: AuthUser[] = [];
  private userRecords: UserRecord[] = [];
  private items: EncryptedVaultItemRow[] = [];
  private shares: SharedItemsRow[] = [];
  private groups: GroupsRow[] = [];
  private groupMembers: GroupMembersRow[] = [];
  private groupItems: GroupItemsRow[] = [];
  private currentUid: string | null = null;
  private subscribers: Array<(c: RealtimeChange) => void> = [];
  private authSubscribers: Array<(c: AuthStateChange) => void> = [];

  /** Tracks every insert/update payload for plaintext-leak inspection. */
  public capturedInsertPayloads: EncryptedItemInsert[] = [];
  public capturedUpdatePayloads: EncryptedItemUpdate[] = [];
  public capturedSharePayloads: ShareInsert[] = [];

  // ---- Auth ----
  async signUp(email: string, authHash: string): Promise<{ userId: string }> {
    if (this.authUsers.some((u) => u.email === email)) {
      throw new Error('email already registered');
    }
    const id = uuid();
    this.authUsers.push({ id, email, authHash });
    this.currentUid = id;
    this.emitAuth('SIGNED_IN');
    return { userId: id };
  }

  async signIn(email: string, authHash: string): Promise<{ userId: string }> {
    const u = this.authUsers.find((x) => x.email === email && x.authHash === authHash);
    if (!u) throw new Error('invalid credentials');
    this.currentUid = u.id;
    this.emitAuth('SIGNED_IN');
    return { userId: u.id };
  }

  async signOut(): Promise<void> {
    this.currentUid = null;
    this.emitAuth('SIGNED_OUT');
  }

  async currentUserId(): Promise<string | null> {
    return this.currentUid;
  }

  async currentSession(): Promise<AuthSession | null> {
    if (!this.currentUid) return null;
    const u = this.authUsers.find((x) => x.id === this.currentUid);
    return { userId: this.currentUid, email: u?.email ?? null };
  }

  onAuthStateChange(handler: (change: AuthStateChange) => void): AuthUnsubscribe {
    this.authSubscribers.push(handler);
    // Emit an INITIAL_SESSION event synchronously to match SupabaseRepository behaviour.
    queueMicrotask(() => {
      const session = this.currentUid
        ? {
            userId: this.currentUid,
            email: this.authUsers.find((x) => x.id === this.currentUid)?.email ?? null,
          }
        : null;
      handler({ event: 'INITIAL_SESSION', session });
    });
    return () => {
      this.authSubscribers = this.authSubscribers.filter((s) => s !== handler);
    };
  }

  private emitAuth(event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'): void {
    const session = this.currentUid
      ? {
          userId: this.currentUid,
          email: this.authUsers.find((x) => x.id === this.currentUid)?.email ?? null,
        }
      : null;
    for (const s of this.authSubscribers) s({ event, session });
  }

  // ---- User record ----
  async createUserRecord(record: UserRecord): Promise<void> {
    this.userRecords.push({ ...record });
  }

  async getUserRecord(userId: string): Promise<UserRecord | null> {
    return this.userRecords.find((u) => u.id === userId) ?? null;
  }

  async getUserDirectoryEntry(email: string) {
    const u = this.userRecords.find((x) => x.email === email);
    if (!u) return null;
    return { id: u.id, email: u.email, publicKey: u.publicKey };
  }

  // ---- Items ----
  async insertItem(payload: EncryptedItemInsert): Promise<EncryptedVaultItemRow> {
    this.assertAuthed();
    this.capturedInsertPayloads.push(structuredClone(payload));
    const now = new Date().toISOString();
    const row: EncryptedVaultItemRow = {
      id: uuid(),
      user_id: this.currentUid!,
      ciphertext: payload.ciphertext,
      iv: payload.iv,
      auth_tag: payload.authTag,
      item_type: payload.itemType,
      search_hash: payload.searchHash,
      folder_id: payload.folderId,
      favorite: payload.favorite,
      version: payload.version,
      created_at: now,
      updated_at: now,
    };
    this.items.push(row);
    this.notify({ type: 'INSERT', row });
    return row;
  }

  async updateItem(id: string, payload: EncryptedItemUpdate): Promise<EncryptedVaultItemRow> {
    this.assertAuthed();
    this.capturedUpdatePayloads.push(structuredClone(payload));
    const row = this.items.find((r) => r.id === id);
    if (!row || row.user_id !== this.currentUid) {
      throw new Error('item not found / not owned');
    }
    if (row.version !== payload.expectedVersion) {
      const e = new Error('version conflict');
      (e as Error & { code?: string }).code = 'VERSION_CONFLICT';
      throw e;
    }
    row.ciphertext = payload.ciphertext;
    row.iv = payload.iv;
    row.auth_tag = payload.authTag;
    row.search_hash = payload.searchHash;
    if (payload.folderId !== undefined) row.folder_id = payload.folderId;
    if (payload.favorite !== undefined) row.favorite = payload.favorite;
    row.version = payload.newVersion;
    row.updated_at = new Date().toISOString();
    this.notify({ type: 'UPDATE', row });
    return row;
  }

  async deleteItem(id: string): Promise<void> {
    this.assertAuthed();
    const idx = this.items.findIndex((r) => r.id === id && r.user_id === this.currentUid);
    if (idx < 0) throw new Error('item not found');
    const [row] = this.items.splice(idx, 1);
    if (row) this.notify({ type: 'DELETE', row });
  }

  async listItems(): Promise<EncryptedVaultItemRow[]> {
    this.assertAuthed();
    return this.items.filter((r) => r.user_id === this.currentUid).map((r) => ({ ...r }));
  }

  async getItem(id: string): Promise<EncryptedVaultItemRow | null> {
    this.assertAuthed();
    const r = this.items.find((x) => x.id === id && x.user_id === this.currentUid);
    return r ? { ...r } : null;
  }

  // ---- Sharing ----
  async insertShare(payload: ShareInsert): Promise<SharedItemsRow> {
    this.assertAuthed();
    this.capturedSharePayloads.push(structuredClone(payload));
    const row: SharedItemsRow = {
      id: uuid(),
      item_id: payload.itemId,
      from_user_id: this.currentUid!,
      to_user_id: payload.toUserId,
      wrapped_key: payload.wrappedKey,
      permission: payload.permission,
      accepted_at: null,
      created_at: new Date().toISOString(),
    };
    this.shares.push(row);
    return row;
  }

  async listIncomingShares(): Promise<SharedItemsRow[]> {
    this.assertAuthed();
    return this.shares.filter((r) => r.to_user_id === this.currentUid).map((r) => ({ ...r }));
  }

  async acceptShare(shareId: string): Promise<SharedItemsRow> {
    this.assertAuthed();
    const row = this.shares.find((r) => r.id === shareId && r.to_user_id === this.currentUid);
    if (!row) throw new Error('share not found');
    row.accepted_at = new Date().toISOString();
    return { ...row };
  }

  async deleteShare(shareId: string): Promise<void> {
    this.assertAuthed();
    const idx = this.shares.findIndex(
      (r) => r.id === shareId && (r.from_user_id === this.currentUid || r.to_user_id === this.currentUid),
    );
    if (idx < 0) throw new Error('share not found');
    this.shares.splice(idx, 1);
  }

  // ---- Groups ----
  async createGroup(args: {
    name: string;
    ownerWrappedGroupKey: WrappedKey;
  }): Promise<{ group: GroupsRow; member: GroupMembersRow }> {
    this.assertAuthed();
    const group: GroupsRow = {
      id: uuid(),
      name: args.name,
      owner_id: this.currentUid!,
      created_at: new Date().toISOString(),
    };
    this.groups.push(group);
    const member: GroupMembersRow = {
      group_id: group.id,
      user_id: this.currentUid!,
      role: 'owner',
      wrapped_group_key: args.ownerWrappedGroupKey,
      joined_at: new Date().toISOString(),
    };
    this.groupMembers.push(member);
    return { group: { ...group }, member: { ...member } };
  }

  async listGroups(): Promise<Array<{ group: GroupsRow; member: GroupMembersRow }>> {
    this.assertAuthed();
    const memberships = this.groupMembers.filter((m) => m.user_id === this.currentUid);
    return memberships.flatMap((member) => {
      const group = this.groups.find((g) => g.id === member.group_id);
      return group ? [{ group: { ...group }, member: { ...member } }] : [];
    });
  }

  async getGroup(groupId: string): Promise<GroupsRow | null> {
    this.assertAuthed();
    // Membership check.
    const isMember = this.groupMembers.some(
      (m) => m.group_id === groupId && m.user_id === this.currentUid,
    );
    if (!isMember) return null;
    const g = this.groups.find((x) => x.id === groupId);
    return g ? { ...g } : null;
  }

  async getGroupMember(groupId: string, userId: string): Promise<GroupMembersRow | null> {
    this.assertAuthed();
    const callerIsMember = this.groupMembers.some(
      (m) => m.group_id === groupId && m.user_id === this.currentUid,
    );
    if (!callerIsMember) return null;
    const m = this.groupMembers.find((x) => x.group_id === groupId && x.user_id === userId);
    return m ? { ...m } : null;
  }

  async listGroupMembers(groupId: string): Promise<GroupMembersRow[]> {
    this.assertAuthed();
    const callerIsMember = this.groupMembers.some(
      (m) => m.group_id === groupId && m.user_id === this.currentUid,
    );
    if (!callerIsMember) return [];
    return this.groupMembers.filter((m) => m.group_id === groupId).map((m) => ({ ...m }));
  }

  async inviteGroupMember(args: {
    groupId: string;
    userId: string;
    role: 'admin' | 'member';
    wrappedGroupKey: WrappedKey;
  }): Promise<GroupMembersRow> {
    this.assertAuthed();
    // Caller must be an admin or the owner.
    const callerRole = this.groupMembers.find(
      (m) => m.group_id === args.groupId && m.user_id === this.currentUid,
    )?.role;
    if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
      throw new Error('not authorised to invite members');
    }
    if (
      this.groupMembers.some((m) => m.group_id === args.groupId && m.user_id === args.userId)
    ) {
      throw new Error('user already a member');
    }
    const member: GroupMembersRow = {
      group_id: args.groupId,
      user_id: args.userId,
      role: args.role,
      wrapped_group_key: args.wrappedGroupKey,
      joined_at: new Date().toISOString(),
    };
    this.groupMembers.push(member);
    return { ...member };
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    this.assertAuthed();
    const idx = this.groupMembers.findIndex(
      (m) => m.group_id === groupId && m.user_id === userId,
    );
    if (idx < 0) throw new Error('member not found');
    this.groupMembers.splice(idx, 1);
  }

  async insertGroupItem(args: {
    groupId: string;
    ciphertext: string;
    iv: string;
    authTag: string;
    itemType: ItemType;
    version: number;
  }): Promise<GroupItemsRow> {
    this.assertAuthed();
    const callerIsMember = this.groupMembers.some(
      (m) => m.group_id === args.groupId && m.user_id === this.currentUid,
    );
    if (!callerIsMember) throw new Error('not a group member');
    const now = new Date().toISOString();
    const row: GroupItemsRow = {
      id: uuid(),
      group_id: args.groupId,
      ciphertext: args.ciphertext,
      iv: args.iv,
      auth_tag: args.authTag,
      item_type: args.itemType,
      created_by: this.currentUid!,
      version: args.version,
      created_at: now,
      updated_at: now,
    };
    this.groupItems.push(row);
    return { ...row };
  }

  async listGroupItems(groupId: string): Promise<GroupItemsRow[]> {
    this.assertAuthed();
    const callerIsMember = this.groupMembers.some(
      (m) => m.group_id === groupId && m.user_id === this.currentUid,
    );
    if (!callerIsMember) return [];
    return this.groupItems.filter((g) => g.group_id === groupId).map((g) => ({ ...g }));
  }

  async deleteGroupItem(itemId: string): Promise<void> {
    this.assertAuthed();
    const idx = this.groupItems.findIndex((g) => g.id === itemId);
    if (idx < 0) throw new Error('group item not found');
    const row = this.groupItems[idx]!;
    const callerIsMember = this.groupMembers.some(
      (m) => m.group_id === row.group_id && m.user_id === this.currentUid,
    );
    if (!callerIsMember) throw new Error('not a group member');
    this.groupItems.splice(idx, 1);
  }

  // ---- Rotation ----
  async rotateMasterPassword(args: {
    newKdfParams: UsersRow['kdf_params'];
    newEncryptedPrivateKey: UsersRow['encrypted_private_key'];
    newItems: Array<{
      id: string;
      ciphertext: string;
      iv: string;
      authTag: string;
      version: number;
    }>;
  }): Promise<void> {
    this.assertAuthed();
    const user = this.userRecords.find((u) => u.id === this.currentUid);
    if (!user) throw new Error('user record missing');
    user.kdfParams = args.newKdfParams;
    user.encryptedPrivateKey = args.newEncryptedPrivateKey;
    for (const it of args.newItems) {
      const row = this.items.find((r) => r.id === it.id && r.user_id === this.currentUid);
      if (!row) throw new Error(`item ${it.id} not found during rotate`);
      row.ciphertext = it.ciphertext;
      row.iv = it.iv;
      row.auth_tag = it.authTag;
      row.version = it.version;
      row.updated_at = new Date().toISOString();
    }
  }

  // ---- Realtime ----
  subscribeItems(onChange: (c: RealtimeChange) => void): RealtimeUnsubscribe {
    this.subscribers.push(onChange);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== onChange);
    };
  }

  private notify(change: RealtimeChange): void {
    for (const s of this.subscribers) s(change);
  }

  private assertAuthed(): void {
    if (!this.currentUid) throw new Error('not authenticated');
  }
}
