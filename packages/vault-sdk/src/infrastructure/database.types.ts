// Hand-written DB types matching supabase/migrations/0001-0008.
// Will be replaced by `supabase gen types typescript` output once a project is linked.
// Design Ref: §3.3 — every secret column is base64 ciphertext + iv + authTag.

export type ItemType = 'login' | 'note' | 'card' | 'identity' | 'totp';

export interface UsersRow {
  id: string;
  email: string;
  kdf_params: {
    algorithm: 'argon2id';
    memoryCost: number;
    timeCost: number;
    parallelism: number;
    saltAuth: string;
    saltVault: string;
  };
  public_key: string;
  encrypted_private_key: { ciphertext: string; iv: string; authTag: string };
  recovery_enabled: boolean;
  created_at: string;
}

export interface EncryptedVaultItemRow {
  id: string;
  user_id: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  item_type: ItemType;
  search_hash: string | null;
  folder_id: string | null;
  favorite: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface FoldersRow {
  id: string;
  user_id: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  created_at: string;
}

export interface SharedItemsRow {
  id: string;
  item_id: string;
  from_user_id: string;
  to_user_id: string;
  wrapped_key: { ciphertext: string; iv: string; authTag: string; ephemeralPublicKey: string };
  permission: 'read' | 'write';
  accepted_at: string | null;
  created_at: string;
}

export interface GroupsRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface GroupMembersRow {
  group_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  wrapped_group_key: { ciphertext: string; iv: string; authTag: string; ephemeralPublicKey: string };
  joined_at: string;
}

export interface GroupItemsRow {
  id: string;
  group_id: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  item_type: ItemType;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AuditEventsRow {
  id: string;
  user_id: string;
  event_type: string;
  ip_hash: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      users: { Row: UsersRow; Insert: Omit<UsersRow, 'created_at'>; Update: Partial<UsersRow> };
      folders: {
        Row: FoldersRow;
        Insert: Omit<FoldersRow, 'id' | 'created_at'>;
        Update: Partial<FoldersRow>;
      };
      encrypted_vault_items: {
        Row: EncryptedVaultItemRow;
        Insert: Omit<EncryptedVaultItemRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<EncryptedVaultItemRow>;
      };
      shared_items: {
        Row: SharedItemsRow;
        Insert: Omit<SharedItemsRow, 'id' | 'created_at' | 'accepted_at'>;
        Update: Partial<SharedItemsRow>;
      };
      groups: {
        Row: GroupsRow;
        Insert: Omit<GroupsRow, 'id' | 'created_at'>;
        Update: Partial<GroupsRow>;
      };
      group_members: {
        Row: GroupMembersRow;
        Insert: Omit<GroupMembersRow, 'joined_at'>;
        Update: Partial<GroupMembersRow>;
      };
      group_items: {
        Row: GroupItemsRow;
        Insert: Omit<GroupItemsRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<GroupItemsRow>;
      };
      audit_events: {
        Row: AuditEventsRow;
        Insert: Omit<AuditEventsRow, 'id' | 'created_at'>;
        Update: Partial<AuditEventsRow>;
      };
    };
    Views: {
      user_directory: {
        Row: { id: string; email: string; public_key: string };
      };
    };
    Functions: {
      rotate_master_password: {
        Args: {
          new_kdf_params: UsersRow['kdf_params'];
          new_encrypted_private_key: UsersRow['encrypted_private_key'];
          new_items: Array<{
            id: string;
            ciphertext: string;
            iv: string;
            authTag: string;
            version?: number;
          }>;
        };
        Returns: void;
      };
    };
  };
}
