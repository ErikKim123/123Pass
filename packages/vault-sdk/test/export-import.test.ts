// FR-15 — export/import round-trip + format detection + plaintext-leak guard.

import { describe, expect, it } from 'vitest';

import {
  createVaultClient,
  decryptFromExport,
  detectImportFormat,
  encryptForExport,
  parse1PasswordCsv,
  parseBitwardenJson,
  type ExportableItem,
  type VaultItemPayload,
} from '../src';

import { InMemoryRepository } from './repository-mock';

const fastKdf = { memoryCost: 8192, timeCost: 1, parallelism: 1 } as const;

const item1: ExportableItem = {
  itemType: 'login',
  favorite: false,
  payload: {
    name: 'Gmail',
    url: 'https://mail.google.com',
    username: 'me@gmail.com',
    password: 'gmail-pw-987654321',
    totpSecret: 'GEZDGNBVGY3TQOJQ',
  },
};
const item2: ExportableItem = {
  itemType: 'note',
  favorite: true,
  payload: {
    name: 'Recovery codes',
    notes: 'AAAA-BBBB-CCCC\nDDDD-EEEE-FFFF',
  },
};

describe('FR-15 — encrypted export round-trip', () => {
  it('encryptForExport → decryptFromExport returns identical items', () => {
    const file = encryptForExport({
      items: [item1, item2],
      exportPassword: 'super-strong-export-pw-001',
      kdfOverrides: fastKdf,
    });
    expect(file.format).toBe('123Pass-export');
    expect(file.version).toBe(1);
    expect(file.kdf.algo).toBe('argon2id-v1');
    expect(file.aead.algo).toBe('aes-256-gcm-v1');

    const restored = decryptFromExport(file, 'super-strong-export-pw-001');
    expect(restored).toHaveLength(2);
    expect(restored[0]!.payload.password).toBe('gmail-pw-987654321');
    expect(restored[0]!.payload.totpSecret).toBe('GEZDGNBVGY3TQOJQ');
    expect(restored[1]!.itemType).toBe('note');
    expect(restored[1]!.favorite).toBe(true);
  });

  it('wrong export password is rejected with EXPORT_DECRYPT_FAILED', () => {
    const file = encryptForExport({
      items: [item1],
      exportPassword: 'correct-export-pw-123',
      kdfOverrides: fastKdf,
    });
    expect(() => decryptFromExport(file, 'wrong-export-pw-456')).toThrow(
      /wrong export password|tampered/i,
    );
  });

  it('rejects export passwords shorter than 12 characters', () => {
    expect(() =>
      encryptForExport({ items: [item1], exportPassword: 'short', kdfOverrides: fastKdf }),
    ).toThrow(/at least 12/i);
  });

  it('tampered ciphertext fails AEAD verification', () => {
    const file = encryptForExport({
      items: [item1],
      exportPassword: 'super-strong-export-pw-001',
      kdfOverrides: fastKdf,
    });
    // Flip one base64 char in the ciphertext.
    const tampered = {
      ...file,
      ciphertext: file.ciphertext.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')),
    };
    expect(() => decryptFromExport(tampered, 'super-strong-export-pw-001')).toThrow(
      /wrong export password|tampered/i,
    );
  });

  it('export file contains no plaintext credentials', () => {
    const file = encryptForExport({
      items: [item1],
      exportPassword: 'super-strong-export-pw-001',
      kdfOverrides: fastKdf,
    });
    const json = JSON.stringify(file);
    expect(json).not.toContain('gmail-pw-987654321');
    expect(json).not.toContain('me@gmail.com');
    expect(json).not.toContain('mail.google.com');
    expect(json).not.toContain('GEZDGNBVGY3TQOJQ');
  });

  it('AAD binds metadata — modifying exportedAt invalidates the file', () => {
    const file = encryptForExport({
      items: [item1],
      exportPassword: 'super-strong-export-pw-001',
      kdfOverrides: fastKdf,
    });
    const tampered = { ...file, exportedAt: '2099-01-01T00:00:00.000Z' };
    expect(() => decryptFromExport(tampered, 'super-strong-export-pw-001')).toThrow();
  });

  it('rejects future format versions at the schema boundary', () => {
    // zod literal(1) rejects anything else — guards against silently accepting
    // a v2 file that uses a different KDF or AEAD.
    const v2File = {
      format: '123Pass-export',
      version: 2,
      kdf: {
        algo: 'argon2id-v1',
        memoryCost: 8192,
        timeCost: 1,
        parallelism: 1,
        salt: 'aGVsbG8gd29ybGQ=',
      },
      aead: { algo: 'aes-256-gcm-v1', iv: 'AAAAAAAAAAAAAAAA', authTag: 'AAAAAAAAAAAAAAAAAAAAAAAA' },
      ciphertext: 'AAAA',
      exportedAt: '2026-05-27T00:00:00.000Z',
    };
    expect(() => decryptFromExport(v2File, 'any-password-12chars')).toThrow();
  });

  it('rejects unknown format identifiers', () => {
    const wrongFormat = {
      format: 'NotAValidFormat',
      version: 1,
      kdf: {
        algo: 'argon2id-v1',
        memoryCost: 8192,
        timeCost: 1,
        parallelism: 1,
        salt: 'aGVsbG8gd29ybGQ=',
      },
      aead: { algo: 'aes-256-gcm-v1', iv: 'AAAAAAAAAAAAAAAA', authTag: 'AAAAAAAAAAAAAAAAAAAAAAAA' },
      ciphertext: 'AAAA',
      exportedAt: '2026-05-27T00:00:00.000Z',
    };
    expect(() => decryptFromExport(wrongFormat, 'any-password-12chars')).toThrow();
  });

  // Backward-compat KAT vector — a real previously-encrypted file blob.
  // If any future change to deriveSingleKey, AAD construction, or AES-GCM
  // breaks decryption of this blob, this test fails. Frozen at format v1.
  it('KAT — decrypts a frozen v1 export blob', () => {
    const KAT_FILE = {
      format: '123Pass-export',
      version: 1,
      kdf: {
        algo: 'argon2id-v1',
        memoryCost: 8192,
        timeCost: 1,
        parallelism: 1,
        salt: 'qZofMivOdtyP7WA7QrzAfA==',
      },
      aead: {
        algo: 'aes-256-gcm-v1',
        iv: 'OEFy/ljhQET4PwK+',
        authTag: 'jCA3euLGXneA1xCn1w1ICg==',
      },
      ciphertext:
        'LUp03ilRushA2CghUYZrXaec2bc5DRuUnNn1M+h/dcZjB66R2Drvq1alTBfvZsAKsHrDLSGWZyE16K7U6ypxQNfjHZDi4GsoDZtqfzCxdau/fwngRNfe+Yfey9XbVvMj0LZQlKIWdv1yCOVAtetAJDXLbRBbAv5hP/tVeGp6yhK3CfAxSab34n/h0eYqYIoMu88gL55hUMt3Esskkog1SEEpZO30AzKKsIeAzY8ZB6dwdzWEFmR10oBSt3RS/cwgX8nOtcnE7q+ZX6wLACH1I/VK/N3dFbuQ8V/JrAzkqI9M4pS8+69KbRwQOaD7Hb7zaRi9',
      exportedAt: '2026-05-27T00:00:00.000Z',
    };
    const restored = decryptFromExport(KAT_FILE, 'kat-export-password-001');
    expect(restored).toHaveLength(2);
    expect(restored[0]!.itemType).toBe('login');
    expect(restored[0]!.payload.name).toBe('KAT Login');
    expect(restored[0]!.payload.password).toBe('kat-password-12345');
    expect(restored[0]!.payload.url).toBe('https://kat.example');
    expect(restored[0]!.payload.username).toBe('kat-user');
    expect(restored[1]!.itemType).toBe('note');
    expect(restored[1]!.favorite).toBe(true);
    expect(restored[1]!.payload.notes).toBe('kat-notes-body');
  });
});

describe('FR-15 — importItems partial-failure reporting', () => {
  it('reports failed item names and reasons without exposing payload', async () => {
    const repo = new InMemoryRepository();
    const client = createVaultClient(repo);
    await client.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });

    // First item is valid; second item has an invalid TOTP secret that zod
    // would reject inside createItem — confirms failure isolation.
    const goodItem: ExportableItem = {
      itemType: 'login',
      favorite: false,
      payload: { name: 'Good', password: 'pass-001' },
    };
    const badItem = {
      itemType: 'login' as const,
      favorite: false,
      payload: {
        name: 'Bad TOTP',
        // not base32 — vaultItemPayloadSchema.parse inside createItem rejects.
        totpSecret: 'this-is-not-base32-!!!',
      } as VaultItemPayload,
    };

    const result = await client.importItems([goodItem, badItem]);
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.name).toBe('Bad TOTP');
    expect(result.failures[0]!.reason).toBeTruthy();
    // Reason must not leak the bad payload's other fields.
    expect(JSON.stringify(result.failures)).not.toContain('this-is-not-base32');
  });

  it('returns empty failures array when all items succeed', async () => {
    const repo = new InMemoryRepository();
    const client = createVaultClient(repo);
    await client.signUp({
      email: 'b@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const result = await client.importItems([item1, item2]);
    expect(result.imported).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.failures).toEqual([]);
  });
});

describe('FR-15 — VaultClient.exportVault round-trip with live vault', () => {
  it('exports unlocked vault and re-imports under a new client', async () => {
    const repo = new InMemoryRepository();
    const c1 = createVaultClient(repo);
    await c1.signUp({
      email: 'a@test',
      masterPassword: 'master-pw-12345',
      kdfOverrides: fastKdf,
    });
    const payload: VaultItemPayload = {
      name: 'Bank',
      url: 'https://bank.example',
      username: 'mr.account',
      password: 'bank-pass-xyz-123',
    };
    await c1.create(payload, 'login');

    const exportFile = await c1.exportVault('export-password-strong-1', {
      kdfOverrides: fastKdf,
    });
    expect(exportFile.format).toBe('123Pass-export');
    expect(JSON.stringify(exportFile)).not.toContain('bank-pass-xyz-123');

    // Brand-new vault, new master password — import the encrypted file.
    const repo2 = new InMemoryRepository();
    const c2 = createVaultClient(repo2);
    await c2.signUp({
      email: 'b@test',
      masterPassword: 'different-master-67890',
      kdfOverrides: fastKdf,
    });
    const items = c2.decryptExport(exportFile, 'export-password-strong-1');
    const result = await c2.importItems(items);
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
    const listed = await c2.list();
    expect(listed[0]!.payload.password).toBe('bank-pass-xyz-123');
  });
});

// ---------- Import format detection ----------

const bitwardenSample = JSON.stringify({
  encrypted: false,
  items: [
    {
      name: 'GitHub',
      type: 1,
      favorite: true,
      notes: 'work account',
      login: {
        username: 'octocat',
        password: 'github-pw-001',
        totp: 'JBSWY3DPEHPK3PXP',
        uris: [{ uri: 'https://github.com', match: null }],
      },
      fields: [
        { name: 'Recovery email', value: 'octo@example.com', type: 0 },
        { name: 'Backup PIN', value: '1234', type: 1 },
      ],
    },
    {
      name: 'Empty login (filtered)',
      type: 1,
      login: { username: null, password: null, totp: null, uris: [] },
    },
    {
      name: 'Note',
      type: 2,
      notes: 'plain text note body',
      login: null,
    },
  ],
});

const onePasswordCsv =
  'Title,Url,Username,Password,Notes,OTPAuth\n' +
  'GitHub,https://github.com,octocat,"github-pw-001","work, account",JBSWY3DPEHPK3PXP\n' +
  'Twitter,https://twitter.com,birdy,"tw-pw-""quoted""",,otpauth://totp/Twitter:birdy?secret=ABCDEFGHIJKLMNOP&issuer=Twitter\n';

describe('FR-15 — detectImportFormat', () => {
  it('detects 123Pass-encrypted JSON', () => {
    const f = encryptForExport({
      items: [item1],
      exportPassword: 'super-strong-export-pw-001',
      kdfOverrides: fastKdf,
    });
    expect(detectImportFormat(JSON.stringify(f))).toBe('123Pass-encrypted');
  });

  it('detects Bitwarden unencrypted JSON', () => {
    expect(detectImportFormat(bitwardenSample)).toBe('bitwarden-json');
  });

  it('detects 1Password CSV by header signature', () => {
    expect(detectImportFormat(onePasswordCsv)).toBe('1password-csv');
  });

  it('rejects unknown formats', () => {
    expect(() => detectImportFormat('hello,world\nfoo,bar\n')).toThrow(/recognize/i);
    expect(() => detectImportFormat('{}')).toThrow(/recognize/i);
  });
});

describe('FR-15 — parseBitwardenJson', () => {
  it('extracts login items with custom fields and TOTP', () => {
    const items = parseBitwardenJson(bitwardenSample);
    // 3 items in source, 1 empty login filtered out → 2 imported.
    expect(items).toHaveLength(2);
    const github = items.find((i) => i.payload.name === 'GitHub')!;
    expect(github.itemType).toBe('login');
    expect(github.favorite).toBe(true);
    expect(github.payload.username).toBe('octocat');
    expect(github.payload.password).toBe('github-pw-001');
    expect(github.payload.url).toBe('https://github.com');
    expect(github.payload.totpSecret).toBe('JBSWY3DPEHPK3PXP');
    expect(github.payload.customFields).toEqual([
      { name: 'Recovery email', value: 'octo@example.com', type: 'text' },
      { name: 'Backup PIN', value: '1234', type: 'password' },
    ]);

    const note = items.find((i) => i.payload.name === 'Note')!;
    expect(note.itemType).toBe('note');
    expect(note.payload.notes).toBe('plain text note body');
  });

  it('rejects encrypted-flagged exports', () => {
    const encrypted = JSON.stringify({ encrypted: true, data: 'opaque' });
    expect(() => parseBitwardenJson(encrypted)).toThrow(/not a recognized/i);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseBitwardenJson('{ not json')).toThrow(/invalid json/i);
  });
});

describe('FR-15 — parse1PasswordCsv', () => {
  it('parses quoted fields, embedded quotes, commas, and otpauth URIs', () => {
    const items = parse1PasswordCsv(onePasswordCsv);
    expect(items).toHaveLength(2);

    const github = items[0]!;
    expect(github.itemType).toBe('login');
    expect(github.payload.name).toBe('GitHub');
    expect(github.payload.password).toBe('github-pw-001');
    expect(github.payload.notes).toBe('work, account');
    expect(github.payload.totpSecret).toBe('JBSWY3DPEHPK3PXP');

    const twitter = items[1]!;
    expect(twitter.payload.password).toBe('tw-pw-"quoted"');
    expect(twitter.payload.totpSecret).toBe('ABCDEFGHIJKLMNOP');
    expect(twitter.payload.notes).toBeUndefined();
  });

  it('rejects CSV without Title or Password columns', () => {
    expect(() => parse1PasswordCsv('Foo,Bar\nx,y\n')).toThrow(/title and password/i);
  });

  it('rejects empty CSV', () => {
    expect(() => parse1PasswordCsv('')).toThrow(/empty/i);
  });
});
