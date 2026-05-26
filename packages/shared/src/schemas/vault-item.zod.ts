// Design Ref: §4.2 — vault-sdk validates payloads before any network call.
// Plan SC: zero plaintext credentials ever reach the wire.

import { z } from 'zod';

export const customFieldSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.string().max(10_000),
  type: z.enum(['text', 'password']),
});

export const vaultItemPayloadSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().max(2000).optional(),
  username: z.string().max(500).optional(),
  password: z.string().max(1024).optional(),
  notes: z.string().max(20_000).optional(),
  totpSecret: z
    .string()
    .regex(/^[A-Z2-7]+=*$/, 'TOTP secret must be base32')
    .max(200)
    .optional(),
  customFields: z.array(customFieldSchema).max(50).optional(),
  tags: z.array(z.string().min(1).max(50)).max(50).optional(),
});

export type VaultItemPayloadInput = z.infer<typeof vaultItemPayloadSchema>;

export const encryptedBlobSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().length(16), // base64(12 bytes) === 16 chars
  authTag: z.string().length(24), // base64(16 bytes) === 24 chars
});

export const encryptedVaultItemInsertSchema = encryptedBlobSchema.extend({
  itemType: z.enum(['login', 'note', 'card', 'identity', 'totp']),
  searchHash: z
    .string()
    .regex(/^[0-9a-f]+$/, 'searchHash must be hex')
    .nullable(),
  folderId: z.string().uuid().nullable(),
  favorite: z.boolean(),
  version: z.number().int().nonnegative(),
});

// Guardrail: reject obvious plaintext credential fields at the SDK boundary.
const plaintextLeakKeys = new Set(['password', 'username', 'url', 'notes', 'totpSecret']);

export function assertNoPlaintextLeak(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    if (plaintextLeakKeys.has(key)) {
      throw new Error(
        `Plaintext leak guardrail: field "${key}" must not appear on encrypted insert payload`,
      );
    }
  }
}
