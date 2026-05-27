// Design Ref: §5.4 Browser Extension Popup checklist.
// Locked state: master-PW form.
// Unlocked state: domain-matched items + Autofill + Generate + Open Vault.

import { useEffect, useMemo, useRef, useState } from 'react';

import { EXPORT_FORMAT_ID } from '@123pass/shared';
import { PasswordGenerator, useVaultStore } from '@123pass/ui';
import type { DecryptedItem, ExportableItem } from '@123pass/vault-sdk';
import { createVaultClient } from '@123pass/vault-sdk';

import { ChromeStorageRepository } from '@/lib/ext-repo';
import { sendToActiveTab, type AutofillPayload } from '@/lib/messaging';
import { domainMatches, getActiveTab } from '@/shared/current-tab';

interface ImportSummary {
  imported: number;
  failed: number;
  failures: Array<{ name: string; reason: string }>;
}

function formatImportSummary(result: ImportSummary, source: string): string {
  const head = `Imported ${result.imported} (${result.failed} failed) from ${source}.`;
  if (result.failures.length === 0) return head;
  const names = result.failures
    .slice(0, 3)
    .map((f) => f.name)
    .join(', ');
  const rest =
    result.failures.length > 3 ? ` +${result.failures.length - 3}` : '';
  return `${head} Failed: ${names}${rest}`;
}

const fastKdf = { memoryCost: 8192, timeCost: 1, parallelism: 1 } as const;

export function Popup(): JSX.Element {
  const attach = useVaultStore((s) => s.attach);
  const client = useVaultStore((s) => s.client);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);

  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // FR-15 — export/import state
  const [exportPw, setExportPw] = useState('');
  const [exporting, setExporting] = useState(false);
  const [importPw, setImportPw] = useState('');
  const [importing, setImporting] = useState(false);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [pendingEncryptedFile, setPendingEncryptedFile] = useState<unknown | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const repo = new ChromeStorageRepository();
    attach(createVaultClient(repo, { autoLockMs: 5 * 60 * 1000 }));
    void getActiveTab().then((tab) => {
      if (tab) {
        setTabUrl(tab.url);
        setTabId(tab.id);
      }
    });
  }, [attach]);

  useEffect(() => {
    if (!client || !isUnlocked) return;
    void client.list().then(setItems);
  }, [client, isUnlocked]);

  const matched = useMemo(() => {
    if (!tabUrl) return [] as DecryptedItem[];
    return items.filter((i) => domainMatches(i.payload.url, tabUrl));
  }, [items, tabUrl]);

  const signUpOrUnlock = async (): Promise<void> => {
    if (!client) return;
    setError(null);
    setBusy(true);
    try {
      // For MVP popup we collapse signup/signin: try signin, fall back to signup.
      const repo = client.repo;
      const existing = await repo.getUserDirectoryEntry(email);
      if (existing) {
        const profile = await repo.getUserRecord(existing.id);
        if (!profile) throw new Error('User profile missing');
        await client.unlock({ email, masterPassword: password, kdfParams: profile.kdfParams });
      } else {
        await client.signUp({ email, masterPassword: password, kdfOverrides: fastKdf });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (): Promise<void> => {
    if (!client || exportPw.length < 12) return;
    setError(null);
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    setError(null);
    setImportInfo(null);
    setPendingEncryptedFile(null);
    const file = e.target.files?.[0];
    if (!file || !client) return;
    try {
      const text = await file.text();
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
        setImportInfo('Encrypted export — enter password.');
        return;
      }
      const items: ExportableItem[] = client.parseImport(text);
      await runImport(items, file.name);
    } catch (parseErr) {
      setError((parseErr as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runImport = async (items: ExportableItem[], source: string): Promise<void> => {
    if (!client) return;
    setImporting(true);
    try {
      const result = await client.importItems(items);
      setImportInfo(formatImportSummary(result, source));
      void client.list().then(setItems);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleDecryptImport = async (): Promise<void> => {
    if (!client || !pendingEncryptedFile || !importPw) return;
    setError(null);
    setImporting(true);
    try {
      const items = client.decryptExport(pendingEncryptedFile, importPw);
      const result = await client.importItems(items);
      setImportInfo(formatImportSummary(result, 'encrypted export'));
      setPendingEncryptedFile(null);
      setImportPw('');
      void client.list().then(setItems);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const autofill = async (item: DecryptedItem): Promise<void> => {
    if (!tabId) return;
    const payload: AutofillPayload = {
      type: 'autofill',
      username: item.payload.username,
      password: item.payload.password,
    };
    try {
      await sendToActiveTab(tabId, payload);
      window.close();
    } catch (e) {
      setError(`Autofill failed: ${(e as Error).message}`);
    }
  };

  if (!client) {
    return <div>Loading…</div>;
  }

  if (!isUnlocked) {
    return (
      <section aria-label="Unlock vault">
        <h1 style={{ marginTop: 0 }}>123Pass</h1>
        <label>
          Email
          <input
            aria-label="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Master Password
          <input
            aria-label="master-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button type="button" onClick={() => void signUpOrUnlock()} disabled={busy || !email || !password}>
          {busy ? 'Working…' : 'Unlock / Sign up'}
        </button>
        {error ? (
          <div role="alert" style={{ color: 'crimson', marginTop: 8 }}>
            {error}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-label="Vault">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>123Pass</strong>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => setShowSettings((s) => !s)} aria-pressed={showSettings}>
            {showSettings ? 'Vault' : 'Settings'}
          </button>
          <button
            type="button"
            onClick={() => {
              client.lock();
              window.close();
            }}
          >
            Lock
          </button>
        </div>
      </header>

      {showSettings ? (
        <div aria-label="Settings">
          <h2 style={{ fontSize: 14 }}>Export vault</h2>
          <p style={{ fontSize: 12, color: '#666' }}>
            Re-encrypted under an export password (≥12 chars) separate from master password.
          </p>
          <input
            aria-label="export-password"
            type="password"
            placeholder="Export password"
            value={exportPw}
            onChange={(e) => setExportPw(e.target.value)}
            style={{ width: '100%' }}
          />
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || exportPw.length < 12}
            style={{ marginTop: 4 }}
          >
            {exporting ? 'Exporting…' : 'Download .json'}
          </button>

          <h2 style={{ fontSize: 14, marginTop: 16 }}>Import vault</h2>
          <p style={{ fontSize: 12, color: '#666' }}>
            123Pass encrypted .json · Bitwarden .json · 1Password .csv
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
            <div style={{ marginTop: 8 }}>
              <input
                aria-label="import-password"
                type="password"
                placeholder="Export password"
                value={importPw}
                onChange={(e) => setImportPw(e.target.value)}
                style={{ width: '100%' }}
              />
              <button
                type="button"
                onClick={() => void handleDecryptImport()}
                disabled={importing || !importPw}
                style={{ marginTop: 4 }}
              >
                {importing ? 'Decrypting…' : 'Decrypt and import'}
              </button>
            </div>
          ) : null}
          {importInfo ? (
            <div role="status" style={{ fontSize: 12, marginTop: 8 }}>
              {importInfo}
            </div>
          ) : null}
          {error ? (
            <div role="alert" style={{ color: 'crimson', marginTop: 8, fontSize: 12 }}>
              {error}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12, color: '#666' }}>
            Current tab: <code>{tabUrl ? new URL(tabUrl).hostname : '—'}</code>
          </p>

          {matched.length > 0 ? (
            <>
              <h2 style={{ fontSize: 14 }}>Matching logins ({matched.length})</h2>
              <ul>
                {matched.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => void autofill(item)}>
                      <div>{item.payload.name}</div>
                      <small style={{ color: '#666' }}>
                        {item.payload.username ?? '(no username)'}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p style={{ fontSize: 13 }}>No saved items match this site.</p>
          )}

          <details onToggle={(e) => setShowGenerator((e.target as HTMLDetailsElement).open)}>
            <summary>Generate password</summary>
            {showGenerator ? <PasswordGenerator /> : null}
          </details>

          {error ? (
            <div role="alert" style={{ color: 'crimson', marginTop: 8 }}>
              {error}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
