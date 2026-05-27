// FR-15 — vault import. Detects the source format and yields normalized
// ExportableItem records ready to be passed through createItem (which performs
// the actual encryption). Parsers themselves never touch ciphertext.

import {
  EXPORT_FORMAT_ID,
  bitwardenExportSchema,
  onePasswordCsvHeaders,
  vaultItemPayloadSchema,
  type BitwardenItem,
  type ImportFormat,
  type OnePasswordCsvHeader,
  type OnePasswordCsvRow,
  type VaultItemPayload,
  type VaultItemType,
} from '@123pass/shared';

import { VaultError } from '../domain/errors';

import type { ExportableItem } from './export-vault';

export function detectImportFormat(fileContent: string): ImportFormat {
  const trimmed = fileContent.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as { format?: unknown; encrypted?: unknown; items?: unknown };
      if (obj.format === EXPORT_FORMAT_ID) return '123Pass-encrypted';
      if (obj.encrypted === false && Array.isArray(obj.items)) return 'bitwarden-json';
    } catch {
      // fall through
    }
  }
  // 1Password CSV header signature — order-agnostic match.
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? '';
  const headers = parseCsvLine(firstLine);
  const has = (h: OnePasswordCsvHeader): boolean => headers.includes(h);
  if (has('Title') && has('Password') && (has('Username') || has('Url'))) {
    return '1password-csv';
  }
  throw new VaultError(
    'IMPORT_FORMAT_UNKNOWN',
    'Could not recognize the file as a 123Pass-encrypted export, Bitwarden JSON, or 1Password CSV.',
  );
}

// ---------- Bitwarden JSON ----------

function bitwardenTypeToVault(type: number): VaultItemType {
  switch (type) {
    case 1:
      return 'login';
    case 2:
      return 'note';
    case 3:
      return 'card';
    case 4:
      return 'identity';
    default:
      return 'note';
  }
}

function bitwardenItemToExportable(item: BitwardenItem): ExportableItem | null {
  const itemType = bitwardenTypeToVault(item.type);
  const firstUri = item.login?.uris?.find((u) => typeof u.uri === 'string' && u.uri.length > 0)?.uri;

  // Map Bitwarden custom fields into our customFields shape (text or password).
  const customFields = item.fields
    ?.filter((f) => f.name.length > 0)
    .map((f) => ({
      name: f.name.slice(0, 100),
      value: f.value.slice(0, 10_000),
      type: (f.type === 1 ? 'password' : 'text') as 'text' | 'password',
    }));

  const payload: VaultItemPayload = {
    name: item.name.slice(0, 200),
    url: firstUri && /^https?:\/\//i.test(firstUri) ? firstUri.slice(0, 2000) : undefined,
    username: item.login?.username?.slice(0, 500) ?? undefined,
    password: item.login?.password?.slice(0, 1024) ?? undefined,
    notes: item.notes?.slice(0, 20_000) ?? undefined,
    totpSecret: normaliseTotpSecret(item.login?.totp ?? null),
    customFields: customFields && customFields.length > 0 ? customFields : undefined,
  };

  // Strip undefined keys so zod's default narrowing does not see noise.
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined),
  ) as VaultItemPayload;

  // Reject silently if the row has no usable fields beyond the name.
  if (!cleaned.password && !cleaned.username && !cleaned.notes && itemType === 'login') return null;

  const parsed = vaultItemPayloadSchema.safeParse(cleaned);
  if (!parsed.success) return null;
  return { itemType, favorite: item.favorite ?? false, payload: parsed.data };
}

export function parseBitwardenJson(content: string): ExportableItem[] {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    throw new VaultError('IMPORT_PARSE_FAILED', `Invalid JSON: ${(e as Error).message}`);
  }
  const parsed = bitwardenExportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new VaultError(
      'IMPORT_PARSE_FAILED',
      'File is not a recognized Bitwarden unencrypted export.',
    );
  }
  const out: ExportableItem[] = [];
  for (const item of parsed.data.items) {
    const mapped = bitwardenItemToExportable(item);
    if (mapped) out.push(mapped);
  }
  return out;
}

// ---------- 1Password CSV ----------

// Minimal RFC 4180 line splitter — handles quoted fields and escaped quotes.
// Does not handle embedded newlines inside quoted fields, but 1Password's CSV
// export already escapes those as \n in the Notes column, so we only need
// per-line parsing.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

function totpFromOtpAuth(otpAuth: string | undefined): string | undefined {
  if (!otpAuth) return undefined;
  // Accept both raw base32 secret and otpauth://totp/...?secret=BASE32
  const m = otpAuth.match(/[?&]secret=([A-Z2-7]+=*)/i);
  if (m && m[1]) return m[1].toUpperCase();
  if (/^[A-Z2-7]+=*$/i.test(otpAuth.trim())) return otpAuth.trim().toUpperCase();
  return undefined;
}

function normaliseTotpSecret(raw: string | null): string | undefined {
  if (!raw) return undefined;
  return totpFromOtpAuth(raw);
}

function rowToExportable(row: OnePasswordCsvRow): ExportableItem | null {
  const name = row.Title?.trim();
  if (!name) return null;

  const payload: VaultItemPayload = {
    name: name.slice(0, 200),
    url: row.Url && /^https?:\/\//i.test(row.Url) ? row.Url.slice(0, 2000) : undefined,
    username: row.Username?.slice(0, 500) || undefined,
    password: row.Password?.slice(0, 1024) || undefined,
    notes: row.Notes?.slice(0, 20_000) || undefined,
    totpSecret: totpFromOtpAuth(row.OTPAuth),
  };
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined && v !== ''),
  ) as VaultItemPayload;
  const parsed = vaultItemPayloadSchema.safeParse(cleaned);
  if (!parsed.success) return null;
  return { itemType: 'login', favorite: false, payload: parsed.data };
}

export function parse1PasswordCsv(content: string): ExportableItem[] {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new VaultError('IMPORT_PARSE_FAILED', 'CSV is empty.');
  }
  const headers = parseCsvLine(lines[0]!);
  const idx: Partial<Record<OnePasswordCsvHeader, number>> = {};
  for (const h of onePasswordCsvHeaders) {
    const i = headers.indexOf(h);
    if (i >= 0) idx[h] = i;
  }
  if (idx.Title === undefined || idx.Password === undefined) {
    throw new VaultError(
      'IMPORT_PARSE_FAILED',
      'CSV must contain at least Title and Password columns.',
    );
  }

  const out: ExportableItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    const row: OnePasswordCsvRow = {
      Title: fields[idx.Title!] ?? '',
      Url: idx.Url !== undefined ? fields[idx.Url] : undefined,
      Username: idx.Username !== undefined ? fields[idx.Username] : undefined,
      Password: idx.Password !== undefined ? fields[idx.Password] : undefined,
      Notes: idx.Notes !== undefined ? fields[idx.Notes] : undefined,
      OTPAuth: idx.OTPAuth !== undefined ? fields[idx.OTPAuth] : undefined,
    };
    const mapped = rowToExportable(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

// Re-exported so detectImportFormat can use it without a second copy.
export { parseCsvLine };
