// FR-15 — encrypted vault export. The exported file is round-trip safe but
// useless without the user-chosen export password. The master password is NEVER
// reused as the export password (domain separation).
//
// Design Ref: §7.3 — new salt + Argon2id + AES-GCM. AAD binds the format header to ciphertext.

import {
  base64Decode,
  base64Encode,
  decrypt,
  deriveSingleKey,
  encrypt,
  getRandomBytes,
  memzero,
  utf8Decode,
  utf8Encode,
} from '@123pass/core-crypto';
import {
  ARGON2_MEMORY_COST,
  ARGON2_PARALLELISM,
  ARGON2_TIME_COST,
  EXPORT_FORMAT_ID,
  EXPORT_VERSION,
  encryptedExportFileSchema,
  vaultItemPayloadSchema,
  type EncryptedExportFile,
  type VaultItemPayload,
  type VaultItemType,
} from '@123pass/shared';

import { VaultError } from '../domain/errors';

export interface ExportableItem {
  itemType: VaultItemType;
  favorite: boolean;
  payload: VaultItemPayload;
}

export interface EncryptExportArgs {
  items: ExportableItem[];
  exportPassword: string;
  kdfOverrides?: { memoryCost?: number; timeCost?: number; parallelism?: number };
  now?: () => Date;
}

function buildAad(file: Pick<EncryptedExportFile, 'format' | 'version' | 'exportedAt'>): Uint8Array {
  return utf8Encode(`${file.format}|${file.version}|${file.exportedAt}`);
}

function deriveExportKey(
  password: string,
  salt: Uint8Array,
  params: { memoryCost: number; timeCost: number; parallelism: number },
): Uint8Array {
  return deriveSingleKey({
    password,
    salt,
    memoryCost: params.memoryCost,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
  });
}

export function encryptForExport(args: EncryptExportArgs): EncryptedExportFile {
  if (typeof args.exportPassword !== 'string' || args.exportPassword.length < 12) {
    throw new VaultError(
      'EXPORT_PASSWORD_TOO_SHORT',
      'Export password must be at least 12 characters',
    );
  }
  // Validate every item payload so we never write garbage we cannot later read back.
  const validated = args.items.map((it) => ({
    itemType: it.itemType,
    favorite: it.favorite,
    payload: vaultItemPayloadSchema.parse(it.payload),
  }));

  const memoryCost = args.kdfOverrides?.memoryCost ?? ARGON2_MEMORY_COST;
  const timeCost = args.kdfOverrides?.timeCost ?? ARGON2_TIME_COST;
  const parallelism = args.kdfOverrides?.parallelism ?? ARGON2_PARALLELISM;

  const salt = getRandomBytes(16);
  const key = deriveExportKey(args.exportPassword, salt, { memoryCost, timeCost, parallelism });

  const exportedAt = (args.now?.() ?? new Date()).toISOString();
  const header = { format: EXPORT_FORMAT_ID, version: EXPORT_VERSION, exportedAt } as const;
  const aad = buildAad(header);

  const plaintext = utf8Encode(JSON.stringify(validated));
  try {
    const blob = encrypt(key, plaintext, aad);
    return encryptedExportFileSchema.parse({
      ...header,
      kdf: {
        algo: 'argon2id-v1',
        memoryCost,
        timeCost,
        parallelism,
        salt: base64Encode(salt),
      },
      aead: {
        algo: 'aes-256-gcm-v1',
        iv: blob.iv,
        authTag: blob.authTag,
      },
      ciphertext: blob.ciphertext,
    });
  } finally {
    memzero(key);
    memzero(plaintext);
  }
}

export function decryptFromExport(
  file: unknown,
  exportPassword: string,
): ExportableItem[] {
  const parsed = encryptedExportFileSchema.parse(file);
  const salt = base64Decode(parsed.kdf.salt);
  const key = deriveExportKey(exportPassword, salt, {
    memoryCost: parsed.kdf.memoryCost,
    timeCost: parsed.kdf.timeCost,
    parallelism: parsed.kdf.parallelism,
  });

  try {
    const aad = buildAad(parsed);
    let pt: Uint8Array;
    try {
      pt = decrypt(
        key,
        { ciphertext: parsed.ciphertext, iv: parsed.aead.iv, authTag: parsed.aead.authTag },
        aad,
      );
    } catch {
      throw new VaultError(
        'EXPORT_DECRYPT_FAILED',
        'Wrong export password or the file has been tampered with.',
      );
    }
    const raw = JSON.parse(utf8Decode(pt)) as unknown;
    memzero(pt);
    if (!Array.isArray(raw)) {
      throw new VaultError('EXPORT_DECRYPT_FAILED', 'Decrypted payload is not an item array.');
    }
    return raw.map((item) => {
      const obj = item as { itemType?: unknown; favorite?: unknown; payload?: unknown };
      const itemType = obj.itemType as VaultItemType;
      if (typeof itemType !== 'string') {
        throw new VaultError('EXPORT_DECRYPT_FAILED', 'Item missing itemType field.');
      }
      return {
        itemType,
        favorite: Boolean(obj.favorite),
        payload: vaultItemPayloadSchema.parse(obj.payload),
      };
    });
  } finally {
    memzero(key);
  }
}
