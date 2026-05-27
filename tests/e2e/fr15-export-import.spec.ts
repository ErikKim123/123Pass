// FR-15 E2E — encrypted vault export round-trip + Bitwarden JSON import +
// 1Password CSV import. Verifies that the zero-knowledge boundary holds
// end-to-end (browser → SDK → repo) and that format auto-detection works.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { signUpFresh, uniqueEmail } from './helpers';

async function writeTempFile(content: string, suffix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '123pass-e2e-'));
  const file = path.join(dir, `import${suffix}`);
  await fs.writeFile(file, content, 'utf8');
  return file;
}

async function captureExport(
  page: Page,
  exportPassword: string,
  savePath: string,
): Promise<void> {
  await page.goto('/settings');
  await page.getByLabel('export-password').fill(exportPassword);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /download encrypted export/i }).click();
  const download = await downloadPromise;
  await download.saveAs(savePath);
}

test.describe('FR-15 export / import', () => {
  test('encrypted export round-trip — vault A exports, vault B imports', async ({
    browser,
  }, testInfo) => {
    // -------- Vault A: sign up, create an item, export to a file --------
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signUpFresh(pageA, { email: uniqueEmail('exp-a'), password: 'master-pw-12345' });
    await pageA.getByRole('button', { name: /\+ new/i }).click();
    await pageA.getByLabel('name').fill('FR15 Round-trip');
    await pageA.getByLabel('url').fill('https://example.com');
    await pageA.getByLabel('username').fill('rt-user@example.com');
    await pageA.getByLabel('password').fill('round-trip-secret-abc');
    await pageA.getByRole('button', { name: /^save$/i }).click();
    await expect(pageA.getByText('FR15 Round-trip').first()).toBeVisible();

    const exportPath = await testInfo.outputPath('export.json');
    await captureExport(pageA, 'export-pw-12chars', exportPath);
    await ctxA.close();

    const fileContent = await fs.readFile(exportPath, 'utf8');
    expect(fileContent).not.toContain('round-trip-secret-abc');
    expect(fileContent).not.toContain('rt-user@example.com');
    const parsed = JSON.parse(fileContent) as { format?: string };
    expect(parsed.format).toBe('123Pass-export');

    // -------- Vault B (fresh context): sign up, import the encrypted file --------
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signUpFresh(pageB, { email: uniqueEmail('exp-b'), password: 'different-pw-67890' });
    await pageB.goto('/settings');
    await pageB.getByLabel('import-file').setInputFiles(exportPath);
    await expect(pageB.getByTestId('import-info')).toContainText(/encrypted.*detected/i);
    await pageB.getByLabel('import-password').fill('export-pw-12chars');
    await pageB.getByRole('button', { name: /decrypt and import/i }).click();
    await expect(pageB.getByTestId('import-info')).toContainText(/Imported 1/i);

    await pageB.goto('/vault');
    await expect(pageB.getByText('FR15 Round-trip').first()).toBeVisible();
    await ctxB.close();
  });

  test('wrong export password is rejected on import', async ({ browser }, testInfo) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signUpFresh(pageA, { email: uniqueEmail('wrong-pw'), password: 'master-pw-12345' });
    await pageA.getByRole('button', { name: /\+ new/i }).click();
    await pageA.getByLabel('name').fill('Item One');
    await pageA.getByLabel('password').fill('one-pw-1234567890');
    await pageA.getByRole('button', { name: /^save$/i }).click();
    const exportPath = await testInfo.outputPath('export.json');
    await captureExport(pageA, 'correct-pw-12char', exportPath);
    await ctxA.close();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signUpFresh(pageB, { email: uniqueEmail('wrong-pw-b'), password: 'different-pw-12345' });
    await pageB.goto('/settings');
    await pageB.getByLabel('import-file').setInputFiles(exportPath);
    await pageB.getByLabel('import-password').fill('totally-wrong-password');
    await pageB.getByRole('button', { name: /decrypt and import/i }).click();
    await expect(pageB.getByTestId('import-error')).toContainText(/wrong export password|tampered/i);
    await ctxB.close();
  });

  test('Bitwarden unencrypted JSON import — login + secureNote', async ({ page }) => {
    await signUpFresh(page, { email: uniqueEmail('bw'), password: 'master-pw-12345' });

    const bitwardenSample = JSON.stringify({
      encrypted: false,
      items: [
        {
          name: 'BW GitHub',
          type: 1,
          favorite: false,
          login: {
            username: 'bw-octocat',
            password: 'bw-pw-9999',
            uris: [{ uri: 'https://github.com', match: null }],
          },
        },
        {
          name: 'BW Note',
          type: 2,
          notes: 'a plain note from bitwarden',
          login: null,
        },
      ],
    });
    const filePath = await writeTempFile(bitwardenSample, '.json');

    await page.goto('/settings');
    await page.getByLabel('import-file').setInputFiles(filePath);
    await expect(page.getByTestId('import-info')).toContainText(/Imported 2/i);

    await page.goto('/vault');
    await expect(page.getByText('BW GitHub').first()).toBeVisible();
    await expect(page.getByText('BW Note').first()).toBeVisible();
  });

  test('1Password CSV import — quoted fields and otpauth secret', async ({ page }) => {
    await signUpFresh(page, { email: uniqueEmail('1p'), password: 'master-pw-12345' });

    const csv =
      'Title,Url,Username,Password,Notes,OTPAuth\n' +
      'OP Twitter,https://twitter.com,birdy,"tw-""quoted""-pw",,otpauth://totp/Twitter:birdy?secret=ABCDEFGHIJKLMNOP&issuer=Twitter\n' +
      'OP GitHub,https://github.com,octo,"gh-pw-001","work, account",\n';
    const filePath = await writeTempFile(csv, '.csv');

    await page.goto('/settings');
    await page.getByLabel('import-file').setInputFiles(filePath);
    await expect(page.getByTestId('import-info')).toContainText(/Imported 2/i);

    await page.goto('/vault');
    await expect(page.getByText('OP Twitter').first()).toBeVisible();
    await expect(page.getByText('OP GitHub').first()).toBeVisible();
  });

  test('unknown file format is rejected with a clear error', async ({ page }) => {
    await signUpFresh(page, { email: uniqueEmail('bad'), password: 'master-pw-12345' });
    const filePath = await writeTempFile('hello,world\nfoo,bar\n', '.csv');

    await page.goto('/settings');
    await page.getByLabel('import-file').setInputFiles(filePath);
    await expect(page.getByTestId('import-error')).toContainText(/recognize|format/i);
  });

  test('export button is disabled until password reaches 12 chars', async ({ page }) => {
    await signUpFresh(page, { email: uniqueEmail('short'), password: 'master-pw-12345' });
    await page.goto('/settings');
    const btn = page.getByRole('button', { name: /download encrypted export/i });
    await expect(btn).toBeDisabled();
    await page.getByLabel('export-password').fill('shortpw');
    await expect(btn).toBeDisabled();
    await page.getByLabel('export-password').fill('twelvechars1');
    await expect(btn).toBeEnabled();
  });
});
