'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { EXPORT_FORMAT_ID } from '@123pass/shared';
import { useVaultStore } from '@123pass/ui';
import type { ExportableItem } from '@123pass/vault-sdk';

interface ImportSummary {
  imported: number;
  failed: number;
  failures: Array<{ name: string; reason: string }>;
}

function formatImportSummary(result: ImportSummary, source: string): string {
  const head = `Imported ${result.imported} item(s) from ${source} (${result.failed} failed).`;
  if (result.failures.length === 0) return head;
  const previewCount = Math.min(result.failures.length, 5);
  const names = result.failures
    .slice(0, previewCount)
    .map((f) => f.name)
    .join(', ');
  const rest =
    result.failures.length > previewCount ? ` and ${result.failures.length - previewCount} more` : '';
  return `${head} Failed: ${names}${rest}.`;
}

export default function SettingsPage(): JSX.Element {
  const client = useVaultStore((s) => s.client);
  const session = client?.currentSession?.();
  const lock = useVaultStore((s) => s.lock);
  const router = useRouter();
  const [rotating, setRotating] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // FR-15 — export
  const [exportPw, setExportPw] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // FR-15 — import
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPw, setImportPw] = useState('');
  const [importing, setImporting] = useState(false);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingEncryptedFile, setPendingEncryptedFile] = useState<unknown | null>(null);

  const handleExport = async (): Promise<void> => {
    setExportError(null);
    if (!client) return;
    if (exportPw.length < 12) {
      setExportError('Export password must be at least 12 characters');
      return;
    }
    setExporting(true);
    try {
      const file = await client.exportVault(exportPw);
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `123pass-vault-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportPw('');
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    setImportError(null);
    setImportInfo(null);
    setPendingEncryptedFile(null);
    const file = e.target.files?.[0];
    if (!file || !client) return;
    const text = await file.text();
    try {
      // Try plain-format detection first (Bitwarden / 1Password).
      // If the file is 123Pass-encrypted, this throws; we then ask for a password.
      try {
        const trimmed = text.trimStart();
        const isEncryptedExport =
          trimmed.startsWith('{') &&
          (() => {
            try {
              return (JSON.parse(trimmed) as { format?: unknown }).format === EXPORT_FORMAT_ID;
            } catch {
              return false;
            }
          })();
        if (isEncryptedExport) {
          setPendingEncryptedFile(JSON.parse(trimmed));
          setImportInfo('Encrypted 123Pass export detected — enter the export password.');
          return;
        }
        const items = client.parseImport(text);
        await runImport(items, file.name);
      } catch (parseErr) {
        setImportError((parseErr as Error).message);
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runImport = async (items: ExportableItem[], sourceName: string): Promise<void> => {
    if (!client) return;
    setImporting(true);
    try {
      const result = await client.importItems(items);
      setImportInfo(formatImportSummary(result, sourceName));
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleDecryptImport = async (): Promise<void> => {
    setImportError(null);
    if (!client || !pendingEncryptedFile) return;
    if (importPw.length < 1) {
      setImportError('Enter the export password');
      return;
    }
    setImporting(true);
    try {
      const items = client.decryptExport(pendingEncryptedFile, importPw);
      const result = await client.importItems(items);
      setImportInfo(formatImportSummary(result, 'encrypted export'));
      setPendingEncryptedFile(null);
      setImportPw('');
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const rotate = async (): Promise<void> => {
    setError(null);
    if (newPw.length < 12) {
      setError('New password must be at least 12 characters');
      return;
    }
    if (newPw !== newPwConfirm) {
      setError('Passwords do not match');
      return;
    }
    if (!client) return;
    setRotating(true);
    try {
      await client.rotate({ newMasterPassword: newPw });
      lock();
      router.replace('/login');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRotating(false);
    }
  };

  return (
    <main>
      <h1>Settings</h1>
      <section>
        <h2>Account</h2>
        <p>Email: {session?.email ?? '—'}</p>
      </section>
      <section>
        <h2>Change master password</h2>
        <p>
          This will re-encrypt every item under a new key, then log you out so you can sign back in
          with the new password.
        </p>
        <label>
          New password
          <input
            aria-label="new-password"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
        </label>
        <label>
          Confirm
          <input
            aria-label="confirm-password"
            type="password"
            value={newPwConfirm}
            onChange={(e) => setNewPwConfirm(e.target.value)}
          />
        </label>
        <button type="button" onClick={() => void rotate()} disabled={rotating || !newPw}>
          {rotating ? 'Rotating…' : 'Change password'}
        </button>
        {error ? (
          <div role="alert" data-testid="settings-error">
            {error}
          </div>
        ) : null}
      </section>

      <section>
        <h2>Export vault</h2>
        <p>
          Re-encrypt every item under a separate <strong>export password</strong> and download as a
          JSON file. The master password is never reused — the file is useless without the export
          password.
        </p>
        <label>
          Export password
          <input
            aria-label="export-password"
            type="password"
            value={exportPw}
            onChange={(e) => setExportPw(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting || exportPw.length < 12}
        >
          {exporting ? 'Exporting…' : 'Download encrypted export'}
        </button>
        {exportError ? (
          <div role="alert" data-testid="export-error">
            {exportError}
          </div>
        ) : null}
      </section>

      <section>
        <h2>Import vault</h2>
        <p>
          Supported formats: 123Pass encrypted export (.json), Bitwarden unencrypted export (.json),
          1Password CSV (.csv). Plaintext credentials never leave this device — each item is
          encrypted locally before being saved.
        </p>
        <input
          ref={fileInputRef}
          aria-label="import-file"
          type="file"
          accept=".json,.csv,application/json,text/csv"
          onChange={(e) => void handleFilePick(e)}
          disabled={importing}
        />
        {pendingEncryptedFile ? (
          <div>
            <label>
              Export password
              <input
                aria-label="import-password"
                type="password"
                value={importPw}
                onChange={(e) => setImportPw(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleDecryptImport()}
              disabled={importing || !importPw}
            >
              {importing ? 'Decrypting…' : 'Decrypt and import'}
            </button>
          </div>
        ) : null}
        {importInfo ? (
          <div role="status" data-testid="import-info">
            {importInfo}
          </div>
        ) : null}
        {importError ? (
          <div role="alert" data-testid="import-error">
            {importError}
          </div>
        ) : null}
      </section>
    </main>
  );
}
