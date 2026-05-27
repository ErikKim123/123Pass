// Admin app environment validation. Mock fallback uses synthetic data so the
// dashboard is browsable without a Supabase project.

import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
});

const parsed = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

export const env = parsed;

export const hasLiveSupabase: boolean =
  Boolean(parsed.NEXT_PUBLIC_SUPABASE_URL) && Boolean(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY);
