// Tauri @tauri-apps/plugin-store backed VaultRepository.
// The Store plugin persists to a JSON file in OS-appropriate app data dir.
// Same zero-knowledge contract as every other adapter — only ciphertext crosses the boundary.

import { LazyStore } from '@tauri-apps/plugin-store';

import type {
  AuthSession,
  AuthStateChange,
  AuthUnsubscribe,
  EncryptedItemInsert,
  EncryptedItemUpdate,
  EncryptedVaultItemRow,
  GroupItemsRow,
  GroupMembersRow,
  GroupsRow,
  ItemType,
  RealtimeChange,
  RealtimeUnsubscribe,
  RepoWrappedKey,
  ShareInsert,
  SharedItemsRow,
  UserRecord,
  UsersRow,
  VaultRepository,
} from '@123pass/vault-sdk';

type WrappedKey = RepoWrappedKey;

const STORE_FILE = 'vault.dat';
const KEY_STATE = 'state';
const KEY_SESSION = 'session';

interface DesktopState {
  authUsers: { id: string; email: string; authHash: string }[];
  userRecords: UserRecord[];
  items: EncryptedVaultItemRow[];
  shares: SharedItemsRow[];
  groups: GroupsRow[];
  groupMembers: GroupMembersRow[];
  groupItems: GroupItemsRow[];
}

let idCounter = 1;
const uuid = (): string =>
  `00000000-0000-0000-0000-${String(idCounter++).padStart(12, '0')}`;

const store = new LazyStore(STORE_FILE);

async function loadState(): Promise<DesktopState> {
  const raw = (await store.get<DesktopState>(KEY_STATE)) ?? null;
  return (
    raw ?? {
      authUsers: [],
      userRecords: [],
      items: [],
      shares: [],
      groups: [],
      groupMembers: [],
      groupItems: [],
    }
  );
}

async function saveState(state: DesktopState): Promise<void> {
  await store.set(KEY_STATE, state);
  await store.save();
}

async function getUid(): Promise<string | null> {
  return (await store.get<string>(KEY_SESSION)) ?? null;
}

async function setUid(uid: string | null): Promise<void> {
  if (uid) await store.set(KEY_SESSION, uid);
  else await store.delete(KEY_SESSION);
  await store.save();
}

export class TauriStoreRepository implements VaultRepository {
  private subscribers: Array<(c: RealtimeChange) => void> = [];
  private authSubscribers: Array<(c: AuthStateChange) => void> = [];

  async signUp(email: string, authHash: string): Promise<{ userId: string }> {
    const state = await loadState();
    if (state.authUsers.some((u) => u.email === email)) throw new Error('email already registered');
    const id = uuid();
    state.authUsers.push({ id, email, authHash });
    await saveState(state);
    await setUid(id);
    void this.emitAuth('SIGNED_IN');
    return { userId: id };
  }

  async signIn(email: string, authHash: string): Promise<{ userId: string }> {
    const state = await loadState();
    const u = state.authUsers.find((x) => x.email === email && x.authHash === authHash);
    if (!u) throw new Error('invalid credentials');
    await setUid(u.id);
    void this.emitAuth('SIGNED_IN');
    return { userId: u.id };
  }

  async signOut(): Promise<void> {
    await setUid(null);
    void this.emitAuth('SIGNED_OUT');
  }

  async currentUserId(): Promise<string | null> {
    return getUid();
  }

  async currentSession(): Promise<AuthSession | null> {
    const uid = await getUid();
    if (!uid) return null;
    const state = await loadState();
    const u = state.authUsers.find((x) => x.id === uid);
    return { userId: uid, email: u?.email ?? null };
  }

  onAuthStateChange(handler: (change: AuthStateChange) => void): AuthUnsubscribe {
    this.authSubscribers.push(handler);
    void this.currentSession().then((session) => handler({ event: 'INITIAL_SESSION', session }));
    return () => {
      this.authSubscribers = this.authSubscribers.filter((s) => s !== handler);
    };
  }

  private async emitAuth(event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'): Promise<void> {
    const session = await this.currentSession();
    for (const s of this.authSubscribers) s({ event, session });
  }

  async createUserRecord(record: UserRecord): Promise<void> {
    const state = await loadState();
    state.userRecords.push(record);
    await saveState(state);
  }

  async getUserRecord(userId: string): Promise<UserRecord | null> {
    const state = await loadState();
    return state.userRecords.find((u) => u.id === userId) ?? null;
  }

  async getUserDirectoryEntry(email: string) {
    const state = await loadState();
    const u = state.userRecords.find((x) => x.email === email);
    if (!u) return null;
    return { id: u.id, email: u.email, publicKey: u.publicKey };
  }

  async insertItem(payload: EncryptedItemInsert): Promise<EncryptedVaultItemRow> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const now = new Date().toISOString();
    const row: EncryptedVaultItemRow = {
      id: uuid(),
      user_id: uid,
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
    state.items.push(row);
    await saveState(state);
    this.notify({ type: 'INSERT', row });
    return row;
  }

  async updateItem(id: string, payload: EncryptedItemUpdate): Promise<EncryptedVaultItemRow> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const row = state.items.find((r) => r.id === id && r.user_id === uid);
    if (!row) throw new Error('item not found');
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
    await saveState(state);
    this.notify({ type: 'UPDATE', row });
    return row;
  }

  async deleteItem(id: string): Promise<void> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const idx = state.items.findIndex((r) => r.id === id && r.user_id === uid);
    if (idx < 0) throw new Error('item not found');
    const [row] = state.items.splice(idx, 1);
    await saveState(state);
    if (row) this.notify({ type: 'DELETE', row });
  }

  async listItems(): Promise<EncryptedVaultItemRow[]> {
    const uid = await getUid();
    if (!uid) return [];
    const state = await loadState();
    return state.items.filter((r) => r.user_id === uid);
  }

  async getItem(id: string): Promise<EncryptedVaultItemRow | null> {
    const uid = await getUid();
    if (!uid) return null;
    const state = await loadState();
    return state.items.find((r) => r.id === id && r.user_id === uid) ?? null;
  }

  async insertShare(payload: ShareInsert): Promise<SharedItemsRow> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const row: SharedItemsRow = {
      id: uuid(),
      item_id: payload.itemId,
      from_user_id: uid,
      to_user_id: payload.toUserId,
      wrapped_key: payload.wrappedKey,
      permission: payload.permission,
      accepted_at: null,
      created_at: new Date().toISOString(),
    };
    state.shares.push(row);
    await saveState(state);
    return row;
  }

  async listIncomingShares(): Promise<SharedItemsRow[]> {
    const uid = await getUid();
    if (!uid) return [];
    const state = await loadState();
    return state.shares.filter((r) => r.to_user_id === uid);
  }

  async acceptShare(shareId: string): Promise<SharedItemsRow> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const row = state.shares.find((r) => r.id === shareId && r.to_user_id === uid);
    if (!row) throw new Error('share not found');
    row.accepted_at = new Date().toISOString();
    await saveState(state);
    return row;
  }

  async deleteShare(shareId: string): Promise<void> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const idx = state.shares.findIndex(
      (r) => r.id === shareId && (r.from_user_id === uid || r.to_user_id === uid),
    );
    if (idx < 0) throw new Error('share not found');
    state.shares.splice(idx, 1);
    await saveState(state);
  }

  async createGroup(args: {
    name: string;
    ownerWrappedGroupKey: WrappedKey;
  }): Promise<{ group: GroupsRow; member: GroupMembersRow }> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const group: GroupsRow = {
      id: uuid(),
      name: args.name,
      owner_id: uid,
      created_at: new Date().toISOString(),
    };
    state.groups.push(group);
    const member: GroupMembersRow = {
      group_id: group.id,
      user_id: uid,
      role: 'owner',
      wrapped_group_key: args.ownerWrappedGroupKey,
      joined_at: new Date().toISOString(),
    };
    state.groupMembers.push(member);
    await saveState(state);
    return { group, member };
  }

  async listGroups(): Promise<Array<{ group: GroupsRow; member: GroupMembersRow }>> {
    const uid = await getUid();
    if (!uid) return [];
    const state = await loadState();
    return state.groupMembers
      .filter((m) => m.user_id === uid)
      .flatMap((member) => {
        const group = state.groups.find((g) => g.id === member.group_id);
        return group ? [{ group, member }] : [];
      });
  }

  async getGroup(groupId: string): Promise<GroupsRow | null> {
    const uid = await getUid();
    if (!uid) return null;
    const state = await loadState();
    const isMember = state.groupMembers.some((m) => m.group_id === groupId && m.user_id === uid);
    if (!isMember) return null;
    return state.groups.find((g) => g.id === groupId) ?? null;
  }

  async getGroupMember(groupId: string, userId: string): Promise<GroupMembersRow | null> {
    const uid = await getUid();
    if (!uid) return null;
    const state = await loadState();
    const callerIsMember = state.groupMembers.some(
      (m) => m.group_id === groupId && m.user_id === uid,
    );
    if (!callerIsMember) return null;
    return state.groupMembers.find((m) => m.group_id === groupId && m.user_id === userId) ?? null;
  }

  async listGroupMembers(groupId: string): Promise<GroupMembersRow[]> {
    const uid = await getUid();
    if (!uid) return [];
    const state = await loadState();
    const callerIsMember = state.groupMembers.some(
      (m) => m.group_id === groupId && m.user_id === uid,
    );
    if (!callerIsMember) return [];
    return state.groupMembers.filter((m) => m.group_id === groupId);
  }

  async inviteGroupMember(args: {
    groupId: string;
    userId: string;
    role: 'admin' | 'member';
    wrappedGroupKey: WrappedKey;
  }): Promise<GroupMembersRow> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const callerRole = state.groupMembers.find(
      (m) => m.group_id === args.groupId && m.user_id === uid,
    )?.role;
    if (!callerRole || (callerRole !== 'owner' && callerRole !== 'admin')) {
      throw new Error('not authorised to invite members');
    }
    if (
      state.groupMembers.some((m) => m.group_id === args.groupId && m.user_id === args.userId)
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
    state.groupMembers.push(member);
    await saveState(state);
    return member;
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const idx = state.groupMembers.findIndex(
      (m) => m.group_id === groupId && m.user_id === userId,
    );
    if (idx < 0) throw new Error('member not found');
    state.groupMembers.splice(idx, 1);
    await saveState(state);
  }

  async insertGroupItem(args: {
    groupId: string;
    ciphertext: string;
    iv: string;
    authTag: string;
    itemType: ItemType;
    version: number;
  }): Promise<GroupItemsRow> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const callerIsMember = state.groupMembers.some(
      (m) => m.group_id === args.groupId && m.user_id === uid,
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
      created_by: uid,
      version: args.version,
      created_at: now,
      updated_at: now,
    };
    state.groupItems.push(row);
    await saveState(state);
    return row;
  }

  async listGroupItems(groupId: string): Promise<GroupItemsRow[]> {
    const uid = await getUid();
    if (!uid) return [];
    const state = await loadState();
    const callerIsMember = state.groupMembers.some(
      (m) => m.group_id === groupId && m.user_id === uid,
    );
    if (!callerIsMember) return [];
    return state.groupItems.filter((g) => g.group_id === groupId);
  }

  async deleteGroupItem(itemId: string): Promise<void> {
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const idx = state.groupItems.findIndex((g) => g.id === itemId);
    if (idx < 0) throw new Error('group item not found');
    const row = state.groupItems[idx]!;
    const callerIsMember = state.groupMembers.some(
      (m) => m.group_id === row.group_id && m.user_id === uid,
    );
    if (!callerIsMember) throw new Error('not a group member');
    state.groupItems.splice(idx, 1);
    await saveState(state);
  }

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
    const uid = await getUid();
    if (!uid) throw new Error('not authenticated');
    const state = await loadState();
    const user = state.userRecords.find((u) => u.id === uid);
    if (!user) throw new Error('user record missing');
    user.kdfParams = args.newKdfParams;
    user.encryptedPrivateKey = args.newEncryptedPrivateKey;
    for (const it of args.newItems) {
      const row = state.items.find((r) => r.id === it.id && r.user_id === uid);
      if (!row) throw new Error(`item ${it.id} not found`);
      row.ciphertext = it.ciphertext;
      row.iv = it.iv;
      row.auth_tag = it.authTag;
      row.version = it.version;
      row.updated_at = new Date().toISOString();
    }
    await saveState(state);
  }

  subscribeItems(onChange: (c: RealtimeChange) => void): RealtimeUnsubscribe {
    this.subscribers.push(onChange);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== onChange);
    };
  }

  private notify(change: RealtimeChange): void {
    for (const s of this.subscribers) s(change);
  }
}
