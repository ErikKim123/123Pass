import { z } from 'zod';

import { encryptedBlobSchema } from './vault-item.zod';

export const kdfParamsSchema = z.object({
  algorithm: z.literal('argon2id'),
  memoryCost: z.number().int().min(8192).max(1_048_576), // 8 MiB .. 1 GiB
  timeCost: z.number().int().min(1).max(10),
  parallelism: z.number().int().min(1).max(16),
  saltAuth: z.string().min(16),
  saltVault: z.string().min(16),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  kdfParams: kdfParamsSchema,
  publicKey: z.string().min(1),
  encryptedPrivateKey: encryptedBlobSchema,
  recoveryEnabled: z.boolean(),
  createdAt: z.string().datetime(),
});

export const masterPasswordSchema = z
  .string()
  .min(12, 'Master password must be at least 12 characters')
  .max(256);
