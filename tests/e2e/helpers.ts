import type { Page } from '@playwright/test';

/** Sign up a fresh test user via the /signup flow. */
export async function signUpFresh(
  page: Page,
  opts: { email: string; password: string },
): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('email').fill(opts.email);
  await page.getByLabel('master-password').fill(opts.password);
  await page.getByLabel('confirm-password').fill(opts.password);
  await page.getByRole('button', { name: /create vault/i }).click();
  // Recovery step shows up next.
  await page.waitForSelector('[data-testid="recovery-generate"]', { timeout: 30_000 });
  await page.getByLabel('confirmed').check();
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.waitForURL('**/vault**', { timeout: 30_000 });
}

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9999)}@test.local`;
}
