// Design Ref: §3.1 — User entity with KDF params stored server-side (non-secret).

import type { EncryptedBlob } from './vault';

export interface KdfParams {
  algorithm: 'argon2id';
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  saltAuth: string; // base64 — derives the auth hash sent to Supabase Auth
  saltVault: string; // base64 — derives the vault encryption key (never sent to server)
}

export interface User {
  id: string;
  email: string;
  kdfParams: KdfParams;
  publicKey: string; // base64 — ECDH P-256 public key
  encryptedPrivateKey: EncryptedBlob; // wrapped with vault key
  recoveryEnabled: boolean;
  createdAt: string;
}
