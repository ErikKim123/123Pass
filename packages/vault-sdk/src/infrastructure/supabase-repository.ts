// Design Ref: §9.1 / §9.3 — production VaultRepository adapter.
//
// INVARIANT (matches MockBrowserRepository / InMemoryRepository):
//   The only insert/update payload shape accepted is ciphertext + iv + authTag.
//   No method takes plaintext credentials. RLS in supabase/migrations/0001-0008.sql
//   is the second line of defence — this adapter assumes RLS is active.
//
// Zero-knowledge boundary:
//   - signUp / signIn send the user's already-derived Argon2id authHash as the
//     Supabase Auth "password". The master password never leaves the device.
//   - Vault item bodies travel as base64 ciphertext + iv + authTag only.


import { VaultError } from '../domain/errors';


import type {
  EncryptedVaultItemRow,
  GroupItemsRow,
  GroupMembersRow,
  GroupsRow,
  ItemType,
  SharedItemsRow,
  UsersRow,
} from './database.types';
import type { TypedSupabaseClient } from './supabase-client';
import type {
  AuthEventType,
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
} from '../domain/repository';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

function mapAuthEvent(supabaseEvent: string): AuthEventType | null {
  switch (supabaseEvent) {
    case 'SIGNED_IN':
      return 'SIGNED_IN';
    case 'SIGNED_OUT':
    case 'USER_DELETED':
      return 'SIGNED_OUT';
    case 'TOKEN_REFRESHED':
      return 'TOKEN_REFRESHED';
    case 'INITIAL_SESSION':
      return 'INITIAL_SESSION';
    default:
      return null;
  }
}

function fromUserRow(row: UsersRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    kdfParams: row.kdf_params,
    publicKey: row.public_key,
    encryptedPrivateKey: row.encrypted_private_key,
    recoveryEnabled: row.recovery_enabled,
  };
}

function rethrow(opName: string, error: { message?: string; code?: string } | null): never {
  if (!error) throw new VaultError('REPOSITORY_ERROR', `${opName} failed (no error returned)`);
  const code = error.code ?? '';
  // Postgres unique-violation -> AUTH_INVALID_CREDENTIALS only makes sense for sign-up email collision;
  // we surface it as REPOSITORY_ERROR and let the caller decide.
  throw new VaultError('REPOSITORY_ERROR', `${opName} failed: ${error.message ?? code}`, {
    pgCode: code,
  });
}

// Untyped client view for from() / rpc(). With DB3 (auto-generated Database in
// database.types.generated.ts), supabase-client.ts now satisfies the SDK's
// GenericSchema constraint — but the generated wire-format types are wider than
// the hand-written domain Row aliases used by repository.ts and use-cases
// (e.g. `item_type: string` vs `ItemType`, `kdf_params: Json` vs structured
// KdfParams). Rather than narrow every read with ~20 explicit `as XxxRow`
// casts, we cast the client once here. All payloads are still constructed from
// typed inputs (UserRecord, EncryptedItemInsert, ...) so call sites remain
// type-safe; this cast only suppresses the row-shape narrowing inside the
// adapter, which is the trust boundary.
type AnySupabaseClient = SupabaseClient;

export class SupabaseRepository implements VaultRepository {
  constructor(private readonly sb: TypedSupabaseClient) {}

  private get db(): AnySupabaseClient {
    return this.sb as unknown as AnySupabaseClient;
  }

  // ---- Auth ----
  async signUp(email: string, authHash: string): Promise<{ userId: string }> {
    const { data, error } = await this.sb.auth.signUp({ email, password: authHash });
    if (error || !data.user) rethrow('signUp', error);
    return { userId: data.user.id };
  }

  async signIn(email: string, authHash: string): Promise<{ userId: string }> {
    const { data, error } = await this.sb.auth.signInWithPassword({
      email,
      password: authHash,
    });
    if (error || !data.user) {
      throw new VaultError(
        'AUTH_INVALID_CREDENTIALS',
        error?.message ?? 'Invalid email or master password',
      );
    }
    return { userId: data.user.id };
  }

  async signOut(): Promise<void> {
    const { error } = await this.sb.auth.signOut();
    if (error) rethrow('signOut', error);
  }

  async currentUserId(): Promise<string | null> {
    const { data } = await this.sb.auth.getUser();
    return data.user?.id ?? null;
  }

  async currentSession(): Promise<AuthSession | null> {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) return null;
    return { userId: data.user.id, email: data.user.email ?? null };
  }

  onAuthStateChange(handler: (change: AuthStateChange) => void): AuthUnsubscribe {
    const { data } = this.sb.auth.onAuthStateChange((event, session) => {
      // Supabase emits more events than we care about; collapse them into our 4.
      const mapped = mapAuthEvent(event);
      if (!mapped) return;
      const authSession: AuthSession | null = session?.user
        ? { userId: session.user.id, email: session.user.email ?? null }
        : null;
      handler({ event: mapped, session: authSession });
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }

  // ---- User profile ----
  async createUserRecord(record: UserRecord): Promise<void> {
    const { error } = await this.db.from('users').insert({
      id: record.id,
      email: record.email,
      kdf_params: record.kdfParams,
      public_key: record.publicKey,
      encrypted_private_key: record.encryptedPrivateKey,
      recovery_enabled: record.recoveryEnabled,
    });
    if (error) rethrow('createUserRecord', error);
  }

  async getUserRecord(userId: string): Promise<UserRecord | null> {
    const { data, error } = await this.db
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) rethrow('getUserRecord', error);
    return data ? fromUserRow(data) : null;
  }

  async getUserDirectoryEntry(
    email: string,
  ): Promise<{ id: string; email: string; publicKey: string } | null> {
    const { data, error } = await this.db
      .from('user_directory')
      .select('id, email, public_key')
      .eq('email', email)
      .maybeSingle();
    if (error) rethrow('getUserDirectoryEntry', error);
    return data ? { id: data.id, email: data.email, publicKey: data.public_key } : null;
  }

  // ---- Vault items ----
  async insertItem(payload: EncryptedItemInsert): Promise<EncryptedVaultItemRow> {
    const uid = await this.requireUserId('insertItem');
    const { data, error } = await this.db
      .from('encrypted_vault_items')
      .insert({
        user_id: uid,
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        auth_tag: payload.authTag,
        item_type: payload.itemType,
        search_hash: payload.searchHash,
        folder_id: payload.folderId,
        favorite: payload.favorite,
        version: payload.version,
      })
      .select()
      .single();
    if (error || !data) rethrow('insertItem', error);
    return data;
  }

  async updateItem(id: string, payload: EncryptedItemUpdate): Promise<EncryptedVaultItemRow> {
    // Optimistic concurrency: the WHERE clause requires the expected version. If the row
    // has moved on, the update returns zero rows and we surface VAULT_VERSION_CONFLICT.
    const patch: Record<string, unknown> = {
      ciphertext: payload.ciphertext,
      iv: payload.iv,
      auth_tag: payload.authTag,
      search_hash: payload.searchHash,
      version: payload.newVersion,
    };
    if (payload.folderId !== undefined) patch.folder_id = payload.folderId;
    if (payload.favorite !== undefined) patch.favorite = payload.favorite;

    const { data, error } = await this.db
      .from('encrypted_vault_items')
      .update(patch)
      .eq('id', id)
      .eq('version', payload.expectedVersion)
      .select()
      .maybeSingle();
    if (error) rethrow('updateItem', error);
    if (!data) {
      throw new VaultError(
        'VAULT_VERSION_CONFLICT',
        `Item ${id} was modified by another device; reload and retry.`,
      );
    }
    return data;
  }

  async deleteItem(id: string): Promise<void> {
    const { error } = await this.db.from('encrypted_vault_items').delete().eq('id', id);
    if (error) rethrow('deleteItem', error);
  }

  async listItems(options?: {
    limit?: number;
    afterUpdatedAt?: string;
  }): Promise<EncryptedVaultItemRow[]> {
    let q = this.db
      .from('encrypted_vault_items')
      .select('*')
      .order('updated_at', { ascending: false });
    if (options?.afterUpdatedAt) q = q.gt('updated_at', options.afterUpdatedAt);
    if (options?.limit) q = q.limit(options.limit);
    const { data, error } = await q;
    if (error) rethrow('listItems', error);
    return data ?? [];
  }

  async getItem(id: string): Promise<EncryptedVaultItemRow | null> {
    const { data, error } = await this.db
      .from('encrypted_vault_items')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) rethrow('getItem', error);
    return data;
  }

  // ---- Sharing ----
  async insertShare(payload: ShareInsert): Promise<SharedItemsRow> {
    const uid = await this.requireUserId('insertShare');
    const { data, error } = await this.db
      .from('shared_items')
      .insert({
        item_id: payload.itemId,
        from_user_id: uid,
        to_user_id: payload.toUserId,
        wrapped_key: payload.wrappedKey,
        permission: payload.permission,
      })
      .select()
      .single();
    if (error || !data) rethrow('insertShare', error);
    return data;
  }

  async listIncomingShares(): Promise<SharedItemsRow[]> {
    const uid = await this.requireUserId('listIncomingShares');
    const { data, error } = await this.db
      .from('shared_items')
      .select('*')
      .eq('to_user_id', uid);
    if (error) rethrow('listIncomingShares', error);
    return data ?? [];
  }

  async acceptShare(shareId: string): Promise<SharedItemsRow> {
    const uid = await this.requireUserId('acceptShare');
    const { data, error } = await this.db
      .from('shared_items')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', shareId)
      .eq('to_user_id', uid)
      .select()
      .maybeSingle();
    if (error) rethrow('acceptShare', error);
    if (!data) throw new VaultError('REPOSITORY_ERROR', `Share ${shareId} not found or not addressed to you`);
    return data;
  }

  async deleteShare(shareId: string): Promise<void> {
    const { error } = await this.db.from('shared_items').delete().eq('id', shareId);
    if (error) rethrow('deleteShare', error);
  }

  // ---- Groups ----
  async createGroup(args: {
    name: string;
    ownerWrappedGroupKey: WrappedKey;
  }): Promise<{ group: GroupsRow; member: GroupMembersRow }> {
    const uid = await this.requireUserId('createGroup');
    const { data: group, error: gErr } = await this.db
      .from('groups')
      .insert({ name: args.name, owner_id: uid })
      .select()
      .single();
    if (gErr || !group) rethrow('createGroup(insert groups)', gErr);

    const { data: member, error: mErr } = await this.db
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: uid,
        role: 'owner',
        wrapped_group_key: args.ownerWrappedGroupKey,
      })
      .select()
      .single();
    if (mErr || !member) {
      // Best-effort rollback. Real Supabase would benefit from a transactional RPC;
      // we surface the partial-failure clearly so callers can retry the membership step.
      await this.db.from('groups').delete().eq('id', group.id);
      rethrow('createGroup(insert member)', mErr);
    }
    return { group, member };
  }

  async listGroups(): Promise<Array<{ group: GroupsRow; member: GroupMembersRow }>> {
    const uid = await this.requireUserId('listGroups');
    const { data, error } = await this.db
      .from('group_members')
      .select('*, groups(*)')
      .eq('user_id', uid);
    if (error) rethrow('listGroups', error);
    type Joined = GroupMembersRow & { groups: GroupsRow | null };
    return (data ?? []).flatMap((m: Joined) => {
      const { groups, ...member } = m;
      return groups ? [{ group: groups, member }] : [];
    });
  }

  async getGroup(groupId: string): Promise<GroupsRow | null> {
    const { data, error } = await this.db
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle();
    if (error) rethrow('getGroup', error);
    return data;
  }

  async getGroupMember(groupId: string, userId: string): Promise<GroupMembersRow | null> {
    const { data, error } = await this.db
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) rethrow('getGroupMember', error);
    return data;
  }

  async listGroupMembers(groupId: string): Promise<GroupMembersRow[]> {
    const { data, error } = await this.db
      .from('group_members')
      .select('*')
      .eq('group_id', groupId);
    if (error) rethrow('listGroupMembers', error);
    return data ?? [];
  }

  async inviteGroupMember(args: {
    groupId: string;
    userId: string;
    role: 'admin' | 'member';
    wrappedGroupKey: WrappedKey;
  }): Promise<GroupMembersRow> {
    const { data, error } = await this.db
      .from('group_members')
      .insert({
        group_id: args.groupId,
        user_id: args.userId,
        role: args.role,
        wrapped_group_key: args.wrappedGroupKey,
      })
      .select()
      .single();
    if (error || !data) rethrow('inviteGroupMember', error);
    return data;
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) rethrow('removeGroupMember', error);
  }

  // ---- Group items ----
  async insertGroupItem(args: {
    groupId: string;
    ciphertext: string;
    iv: string;
    authTag: string;
    itemType: ItemType;
    version: number;
  }): Promise<GroupItemsRow> {
    const uid = await this.requireUserId('insertGroupItem');
    const { data, error } = await this.db
      .from('group_items')
      .insert({
        group_id: args.groupId,
        ciphertext: args.ciphertext,
        iv: args.iv,
        auth_tag: args.authTag,
        item_type: args.itemType,
        created_by: uid,
        version: args.version,
      })
      .select()
      .single();
    if (error || !data) rethrow('insertGroupItem', error);
    return data;
  }

  async listGroupItems(groupId: string): Promise<GroupItemsRow[]> {
    const { data, error } = await this.db
      .from('group_items')
      .select('*')
      .eq('group_id', groupId)
      .order('updated_at', { ascending: false });
    if (error) rethrow('listGroupItems', error);
    return data ?? [];
  }

  async deleteGroupItem(itemId: string): Promise<void> {
    const { error } = await this.db.from('group_items').delete().eq('id', itemId);
    if (error) rethrow('deleteGroupItem', error);
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
    const { error } = await this.db.rpc('rotate_master_password', {
      new_kdf_params: args.newKdfParams,
      new_encrypted_private_key: args.newEncryptedPrivateKey,
      new_items: args.newItems,
    });
    if (error) rethrow('rotateMasterPassword', error);
  }

  // ---- Realtime ----
  subscribeItems(onChange: (change: RealtimeChange) => void): RealtimeUnsubscribe {
    const channel: RealtimeChannel = this.sb
      .channel('encrypted_vault_items_changes')
      .on(
        // @supabase/supabase-js Realtime postgres_changes — typed loosely because the
        // SDK's generic signature is wider than what we need.
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'encrypted_vault_items' } as never,
        (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: EncryptedVaultItemRow; old: EncryptedVaultItemRow }) => {
          const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
          onChange({ type: payload.eventType, row });
        },
      )
      .subscribe();
    return () => {
      void this.sb.removeChannel(channel);
    };
  }

  // ---- Helpers ----
  private async requireUserId(op: string): Promise<string> {
    const uid = await this.currentUserId();
    if (!uid) throw new VaultError('AUTH_REQUIRED', `${op} requires an authenticated session`);
    return uid;
  }
}

export function createSupabaseRepository(client: TypedSupabaseClient): SupabaseRepository {
  return new SupabaseRepository(client);
}
