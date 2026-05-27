// Design Ref: §6.1 — vault-sdk errors. User-facing message + structured code.

export type VaultErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'VAULT_LOCKED'
  | 'VAULT_ALREADY_UNLOCKED'
  | 'VAULT_VERSION_CONFLICT'
  | 'ITEM_NOT_FOUND'
  | 'SHARE_RECIPIENT_NOT_FOUND'
  | 'PLAINTEXT_LEAK_GUARD'
  | 'RECOVERY_INVALID'
  | 'REPOSITORY_ERROR'
  | 'NETWORK_OFFLINE'
  | 'EXPORT_PASSWORD_TOO_SHORT'
  | 'EXPORT_DECRYPT_FAILED'
  | 'IMPORT_FORMAT_UNKNOWN'
  | 'IMPORT_PARSE_FAILED';

export class VaultError extends Error {
  public readonly code: VaultErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: VaultErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    this.details = details;
  }
}
