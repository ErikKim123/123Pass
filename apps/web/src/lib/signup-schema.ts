import { z } from 'zod';

import { masterPasswordSchema } from '@123pass/shared';

export const signUpAndUnlockArgsSchema = z
  .object({
    email: z.string().email(),
    password: masterPasswordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
