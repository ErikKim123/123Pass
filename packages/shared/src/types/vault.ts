// Design Ref: §3.1 — vault entities. EncryptedVaultItem is the only shape that crosses the network.

export type VaultItemType = 'login' | 'note' | 'card' | 'identity' | 'totp';

export interface EncryptedBlob {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

export interface CustomField {
  name: string;
  value: string;
  type: 'text' | 'password';
}

// Plaintext payload — NEVER leaves the client unencrypted.
export interface VaultItemPayload {
  name: string;
  url?: string;
  username?: string;
  password?: string;
  notes?: string;
  totpSecret?: string; // base32
  customFields?: CustomField[];
  tags?: string[];
}

// Stored on the server. All sensitive fields are inside `ciphertext`.
export interface EncryptedVaultItem extends EncryptedBlob {
  id: string;
  userId: string;
  itemType: VaultItemType;
  searchHash: string | null; // hex
  folderId: string | null;
  favorite: boolean;
  version: number;
  createdAt: string; // ISO 8601
  updatedAt: string;
}
