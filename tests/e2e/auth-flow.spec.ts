// Design Ref: §8.4 — auth flow E2E.
// signup → recovery seed → /vault → lock → /login → unlock → /vault

import { expect, test } from '@playwright/test';

import { signUpFresh, uniqueEmail } from './helpers';

test.describe('auth flow', () => {
  test('signup creates a vault and lands on /vault', async ({ page }) => {
    const email = uniqueEmail('signup');
    await signUpFresh(page, { email, password: 'master-pw-12345' });
    await expect(page).toHaveURL(/\/vault$/);
  });

  test('lock returns to /login', async ({ page }) => {
    const email = uniqueEmail('lock');
    await signUpFresh(page, { email, password: 'master-pw-12345' });
    await page.getByRole('button', { name: /^lock$/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('rejects wrong master password with generic error', async ({ page }) => {
    const email = uniqueEmail('wrongpw');
    await signUpFresh(page, { email, password: 'master-pw-12345' });
    await page.getByRole('button', { name: /^lock$/i }).click();
    await page.getByLabel('email').fill(email);
    await page.getByLabel('master-password').fill('wrong-password-9999');
    await page.getByRole('button', { name: /^unlock$/i }).click();
    await expect(page.getByTestId('lock-error')).toContainText(/incorrect|invalid/i);
  });
});
