// Design Ref: §8.4 — group flow E2E.
// Single-user signup → create group → add group item → verify in list.
// Full multi-user invite/accept requires a real Supabase backend (RUNTIME-01).

import { expect, test } from '@playwright/test';

import { signUpFresh, uniqueEmail } from './helpers';

test.describe('group flow', () => {
  test('create group and add a group item', async ({ page }) => {
    await signUpFresh(page, { email: uniqueEmail('group'), password: 'master-pw-12345' });

    await page.goto('/groups');
    await page.getByRole('button', { name: /\+ new group/i }).click();
    await page.getByLabel('group-name').fill('Family');
    await page.getByRole('button', { name: /^create$/i }).click();

    // Group should be listed and clickable.
    const familyButton = page.getByRole('button', { name: /Family.*owner/i });
    await expect(familyButton).toBeVisible();
    await familyButton.click();

    // Add an item via the inline form.
    await page.getByLabel('group-item-name').fill('Netflix (Family)');
    await page.getByLabel('group-item-password').fill('shared-pw-1234');
    await page.getByRole('button', { name: /^add$/i }).click();

    await expect(page.getByText('Netflix (Family)')).toBeVisible();
  });
});
