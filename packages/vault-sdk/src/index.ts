// @123pass/vault-sdk — entry point for all apps.
// Design Ref: §9.3 — apps depend on this package, never on @supabase/* directly.

export { VaultClient, createVaultClient } from './vault-client';

export {
  createSupabaseClient,
  type SupabaseClientOptions,
  type TypedSupabaseClient,
} from './infrastructure/supabase-client';

export {
  SupabaseRepository,
  createSupabaseRepository,
} from './infrastructure/supabase-repository';

export type * from './infrastructure/database.types';

export { VaultError, type VaultErrorCode } from './domain/errors';
export type {
  EncryptedItemInsert,
  EncryptedItemUpdate,
  RealtimeChange,
  RealtimeUnsubscribe,
  ShareInsert,
  UserRecord,
  VaultRepository,
  WrappedKey as RepoWrappedKey,
} from './domain/repository';

export type { DecryptedItem } from './usecases/item-crud';
export type { UnlockedSession } from './usecases/unlock-vault';
export type { SyncEvent, SyncEventType } from './usecases/sync';
export { unwrapSharedVaultKey } from './usecases/share-item';

// Group UseCases
export {
  createGroup,
  inviteGroupMember,
  acceptGroupInvite,
  listMyGroups,
  type GroupSummary,
} from './usecases/groups';
export {
  addItemToGroup,
  listGroupItems,
  type DecryptedGroupItem,
} from './usecases/group-items';
export { acceptShare, openSharedItem } from './usecases/share-accept';

// HIBP (module-11)
export {
  sha1HexOfPassword,
  fetchPwnedRange,
  checkPwnedRange,
  type PwnedHit,
} from './usecases/hibp';

// FR-15 — export / import
export {
  encryptForExport,
  decryptFromExport,
  type ExportableItem,
  type EncryptExportArgs,
} from './usecases/export-vault';
export {
  detectImportFormat,
  parseBitwardenJson,
  parse1PasswordCsv,
} from './usecases/import-vault';

export const VAULT_SDK_VERSION = '0.2.0-fr15';
