// FR-15 — vault export / import schemas.
// Design Ref: §7.3 (re-encrypt with new key) and §9.3 (zero-knowledge boundary).
//
// Three formats are recognized:
//   1. 123Pass-encrypted JSON v1  — round-trip safe, re-encrypted under a user-chosen export password.
//   2. Bitwarden unencrypted JSON — sourced from Bitwarden's "Export vault → JSON" feature.
//   3. 1Password CSV              — sourced from 1Password 8 "File → Export → CSV".
//
// Plaintext credentials in CSV/JSON imports never leave the device — they are
// encrypted and stored via the normal createItem path immediately after parsing.

import { z } from 'zod';

import { ARGON2_MEMORY_COST, ARGON2_PARALLELISM, ARGON2_TIME_COST } from '../constants';

export const EXPORT_FORMAT_ID = '123Pass-export';
export const EXPORT_VERSION = 1;

export const exportKdfParamsSchema = z.object({
  algo: z.literal('argon2id-v1'),
  memoryCost: z.number().int().positive().default(ARGON2_MEMORY_COST),
  timeCost: z.number().int().positive().default(ARGON2_TIME_COST),
  parallelism: z.number().int().positive().default(ARGON2_PARALLELISM),
  salt: z.string().min(8), // base64
});

export const exportAeadParamsSchema = z.object({
  algo: z.literal('aes-256-gcm-v1'),
  iv: z.string().length(16), // base64(12 bytes)
  authTag: z.string().length(24), // base64(16 bytes)
});

export const encryptedExportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT_ID),
  version: z.literal(EXPORT_VERSION),
  kdf: exportKdfParamsSchema,
  aead: exportAeadParamsSchema,
  ciphertext: z.string().min(1), // base64
  exportedAt: z.string().datetime(),
});

export type EncryptedExportFile = z.infer<typeof encryptedExportFileSchema>;

// ---------- Bitwarden unencrypted JSON ----------
// Reference: https://bitwarden.com/help/condition-bitwarden-import/  (subset we accept)

export const bitwardenLoginSchema = z.object({
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  totp: z.string().nullable().optional(),
  uris: z
    .array(
      z.object({
        uri: z.string().nullable().optional(),
        match: z.number().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

export const bitwardenItemSchema = z.object({
  name: z.string().min(1),
  notes: z.string().nullable().optional(),
  favorite: z.boolean().optional(),
  type: z.number().int(), // 1 login, 2 secureNote, 3 card, 4 identity
  login: bitwardenLoginSchema.nullable().optional(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        type: z.number().int(), // 0 text, 1 hidden
      }),
    )
    .nullable()
    .optional(),
});

export const bitwardenExportSchema = z.object({
  encrypted: z.literal(false),
  items: z.array(bitwardenItemSchema),
});

export type BitwardenItem = z.infer<typeof bitwardenItemSchema>;

// ---------- 1Password 8 CSV ----------
// 1Password's CSV export header is fixed: Title,Url,Username,Password,Notes,OTPAuth.
// We accept both that exact order and any column subset by header lookup.

export const onePasswordCsvHeaders = [
  'Title',
  'Url',
  'Username',
  'Password',
  'Notes',
  'OTPAuth',
] as const;

export type OnePasswordCsvHeader = (typeof onePasswordCsvHeaders)[number];

export interface OnePasswordCsvRow {
  Title: string;
  Url?: string;
  Username?: string;
  Password?: string;
  Notes?: string;
  OTPAuth?: string;
}

export type ImportFormat = '123Pass-encrypted' | 'bitwarden-json' | '1password-csv';
