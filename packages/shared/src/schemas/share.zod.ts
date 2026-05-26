import { z } from 'zod';

export const wrappedKeySchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().length(16),
  authTag: z.string().length(24),
  ephemeralPublicKey: z.string().min(1),
});

export const sharePermissionSchema = z.enum(['read', 'write']);

export const sharedItemInsertSchema = z.object({
  itemId: z.string().uuid(),
  toUserId: z.string().uuid(),
  wrappedKey: wrappedKeySchema,
  permission: sharePermissionSchema,
});

export const groupRoleSchema = z.enum(['owner', 'admin', 'member']);
