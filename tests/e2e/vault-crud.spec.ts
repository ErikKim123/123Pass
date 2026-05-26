// Design Ref: §8.4 — vault CRUD E2E.

import { expect, test } from '@playwright/test';

import { signUpFresh, uniqueEmail } from './helpers';

test.describe('vault CRUD', () => {
  test('add → list → select → delete', async ({ page }) => {
    await signUpFresh(page, { email: uniqueEmail('crud'), password: 'master-pw-12345' });

    // Open + New dialog and create a login item.
    await page.getByRole('button', { name: /\+ new/i }).click();
    await page.getByLabel('name').fill('E2E Gmail');
    await page.getByLabel('url').fill('https://mail.google.com');
    await page.getByLabel('username').fill('e2e@gmail.com');
    await page.getByLabel('password').fill('secret-pw-7531');
    await page.getByRole('button', { name: /^save$/i }).click();

    // Item should appear in the list.
    const item = page.getByText('E2E Gmail').first();
    await expect(item).toBeVisible();

    // Select item — detail pane shows username.
    await item.click();
    await expect(page.getByTestId('detail-username')).toHaveText('e2e@gmail.com');

    // Delete via detail pane.
    await page.getByRole('button', { name: /^delete$/i }).click();
    await expect(page.getByText('E2E Gmail')).not.toBeVisible();
  });

  test('search filters items locally', async ({ page }) => {
    await signUpFresh(page, { email: uniqueEmail('search'), password: 'master-pw-12345' });
    // Add two items with different names.
    for (const name of ['Github', 'Twitter']) {
      await page.getByRole('button', { name: /\+ new/i }).click();
      await page.getByLabel('name').fill(name);
      await page.getByLabel('password').fill('pw-1234567890');
      await page.getByRole('button', { name: /^save$/i }).click();
    }
    await page.getByLabel('search').fill('Twitter');
    await expect(page.getByText('Github')).not.toBeVisible();
    await expect(page.getByText('Twitter')).toBeVisible();
  });
});
