// Design Ref: §11.1 — VaultClient: the single entry point apps interact with.
// Holds the in-memory unlocked session and routes calls to UseCases.

import { memzero } from '@123pass/core-crypto';
import type { VaultItemPayload, VaultItemType, WrappedKey } from '@123pass/shared';

import { VaultError } from './domain/errors';
import {
  decryptFromExport,
  encryptForExport,
  type EncryptExportArgs,
  type ExportableItem,
} from './usecases/export-vault';
import {
  detectImportFormat,
  parse1PasswordCsv,
  parseBitwardenJson,
} from './usecases/import-vault';
import {
  createItem,
  deleteItem,
  listItems,
  readItem,
  searchHashForQuery,
  searchItems,
  updateItem,
  type DecryptedItem,
} from './usecases/item-crud';
import {
  rotateMasterPassword,
  type RotateArgs,
  type RotateResult,
} from './usecases/rotate-master-password';
import { shareItem, unwrapSharedVaultKey, type ShareItemArgs } from './usecases/share-item';
import { signUpAndUnlock, type SignUpArgs } from './usecases/signup-and-unlock';
import { subscribeSync, type SyncEvent } from './usecases/sync';
import {
  unlockWithKdfParams,
  type KnownKdfUnlockArgs,
  type UnlockedSession,
} from './usecases/unlock-vault';

import type { VaultRepository } from './domain/repository';

export class VaultClient {
  private session: UnlockedSession | null = null;
  private autoLockTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public readonly repo: VaultRepository,
    private readonly options: { autoLockMs?: number } = {},
  ) {}

  // ---- State ----
  isUnlocked(): boolean {
    return this.session !== null;
  }

  currentSession(): UnlockedSession {
    if (!this.session) throw new VaultError('VAULT_LOCKED', 'Vault is locked. Unlock first.');
    return this.session;
  }

  // ---- Lifecycle ----
  async signUp(args: Omit<SignUpArgs, 'repo'>): Promise<UnlockedSession> {
    if (this.session) {
      throw new VaultError('VAULT_ALREADY_UNLOCKED', 'Cannot sign up while unlocked.');
    }
    this.session = await signUpAndUnlock({ ...args, repo: this.repo });
    this.armAutoLock();
    return this.session;
  }

  async unlock(args: Omit<KnownKdfUnlockArgs, 'repo'>): Promise<UnlockedSession> {
    if (this.session) {
      throw new VaultError('VAULT_ALREADY_UNLOCKED', 'Vault already unlocked. Lock first.');
    }
    this.session = await unlockWithKdfParams({ ...args, repo: this.repo });
    this.armAutoLock();
    return this.session;
  }

  /**
   * Wipe key material from memory. Idempotent. Leaves the Supabase auth session
   * alone — call signOutFully() to also revoke server-side credentials.
   * Design Ref: §7.1 V6.2.5.
   */
  lock(): void {
    if (this.session) {
      memzero(this.session.vaultKey);
      memzero(this.session.privateKey);
      this.session = null;
    }
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }

  /**
   * Lock the vault AND end the Supabase Auth session (revokes JWT, removes the
   * persisted session from local storage). Use this for "Sign out" UX. Use
   * lock() alone for "Lock for now, I'll be back".
   */
  async signOutFully(): Promise<void> {
    this.lock();
    await this.repo.signOut();
  }

  // ---- Activity tracking → auto-lock ----
  touch(): void {
    if (this.session) this.armAutoLock();
  }

  private armAutoLock(): void {
    if (!this.options.autoLockMs) return;
    if (this.autoLockTimer) clearTimeout(this.autoLockTimer);
    this.autoLockTimer = setTimeout(() => this.lock(), this.options.autoLockMs);
  }

  // ---- CRUD ----
  create(
    payload: VaultItemPayload,
    itemType: VaultItemType,
    options?: { folderId?: string | null; favorite?: boolean },
  ): Promise<DecryptedItem> {
    return createItem(this.repo, this.currentSession(), payload, itemType, options);
  }

  read(itemId: string): Promise<DecryptedItem> {
    return readItem(this.repo, this.currentSession(), itemId);
  }

  list(): Promise<DecryptedItem[]> {
    return listItems(this.repo, this.currentSession());
  }

  update(
    itemId: string,
    payload: VaultItemPayload,
    expectedVersion: number,
    options?: { folderId?: string | null; favorite?: boolean },
  ): Promise<DecryptedItem> {
    return updateItem(this.repo, this.currentSession(), itemId, payload, expectedVersion, options);
  }

  delete(itemId: string): Promise<void> {
    this.currentSession();
    return deleteItem(this.repo, itemId);
  }

  // ---- Search ----
  search(items: DecryptedItem[], query: string): DecryptedItem[] {
    return searchItems(this.currentSession(), items, query);
  }

  searchHashFor(query: string): string {
    return searchHashForQuery(this.currentSession(), query);
  }

  // ---- Share ----
  share(args: Omit<ShareItemArgs, 'repo' | 'session'>): Promise<void> {
    return shareItem({ ...args, repo: this.repo, session: this.currentSession() });
  }

  unwrapSharedKey(wrappedKey: WrappedKey): Uint8Array {
    return unwrapSharedVaultKey({ session: this.currentSession(), wrappedKey });
  }

  // ---- Rotate ----
  async rotate(args: Omit<RotateArgs, 'repo' | 'session'>): Promise<RotateResult> {
    const result = await rotateMasterPassword({
      ...args,
      repo: this.repo,
      session: this.currentSession(),
    });
    // Replace the in-memory session vaultKey atomically.
    if (this.session) {
      memzero(this.session.vaultKey);
      this.session = result.newSession;
    }
    return result;
  }

  // ---- Sync ----
  subscribe(onEvent: (event: SyncEvent) => void): () => void {
    return subscribeSync(this.repo, this.currentSession(), onEvent);
  }

  // ---- FR-15: Export / Import ----
  /**
   * Re-encrypt the entire vault under a user-chosen export password and return
   * a portable file payload. The master password is never reused — domain
   * separation per Design §7.3.
   */
  async exportVault(
    exportPassword: string,
    options?: { kdfOverrides?: EncryptExportArgs['kdfOverrides'] },
  ): Promise<ReturnType<typeof encryptForExport>> {
    const items = await this.list();
    const exportable: ExportableItem[] = items.map((it) => ({
      itemType: it.itemType,
      favorite: it.favorite,
      payload: it.payload,
    }));
    return encryptForExport({
      items: exportable,
      exportPassword,
      kdfOverrides: options?.kdfOverrides,
    });
  }

  /**
   * Decrypt a 123Pass-encrypted export file using its export password.
   * Does NOT touch the live vault — caller decides what to do with the items.
   */
  decryptExport(file: unknown, exportPassword: string): ExportableItem[] {
    return decryptFromExport(file, exportPassword);
  }

  /**
   * Parse an external import file (Bitwarden JSON or 1Password CSV) into
   * ExportableItem records. For 123Pass-encrypted files, callers should use
   * decryptExport instead (since it needs a password).
   */
  parseImport(content: string): ExportableItem[] {
    const format = detectImportFormat(content);
    if (format === 'bitwarden-json') return parseBitwardenJson(content);
    if (format === '1password-csv') return parse1PasswordCsv(content);
    // 123Pass-encrypted requires a password — caller must use decryptExport.
    throw new VaultError(
      'IMPORT_FORMAT_UNKNOWN',
      'Use decryptExport(file, password) for 123Pass-encrypted files.',
    );
  }

  /**
   * Bulk-import already-parsed items into the live vault. Each item passes
   * through the standard createItem path so encryption boundaries are preserved
   * and the plaintext-leak guardrail still runs.
   *
   * Returns counts plus a failures array so UIs can show which rows failed
   * and why. Failure messages do NOT include the item payload — only its
   * `name` (already user-chosen, non-secret) and the error code/message.
   */
  async importItems(
    items: ExportableItem[],
    options?: { folderId?: string | null },
  ): Promise<{
    imported: number;
    failed: number;
    failures: Array<{ name: string; reason: string }>;
  }> {
    const session = this.currentSession();
    let imported = 0;
    const failures: Array<{ name: string; reason: string }> = [];
    for (const item of items) {
      try {
        await createItem(this.repo, session, item.payload, item.itemType, {
          folderId: options?.folderId ?? null,
          favorite: item.favorite,
        });
        imported++;
      } catch (err) {
        failures.push({
          name: item.payload.name,
          reason: (err as Error).message,
        });
      }
    }
    return { imported, failed: failures.length, failures };
  }
}

export function createVaultClient(
  repo: VaultRepository,
  options?: { autoLockMs?: number },
): VaultClient {
  return new VaultClient(repo, options);
}
