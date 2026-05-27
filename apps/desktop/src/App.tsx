import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useEffect, useRef, useState } from 'react';

import { CLIPBOARD_CLEAR_MS, EXPORT_FORMAT_ID } from '@123pass/shared';
import { useVaultStore } from '@123pass/ui';
import type { DecryptedItem, ExportableItem } from '@123pass/vault-sdk';
import { createVaultClient } from '@123pass/vault-sdk';

import { registerHotkeys, unregisterHotkeys } from '@/lib/hotkeys';
import { TauriStoreRepository } from '@/lib/tauri-repo';

const fastKdf = { memoryCost: 8192, timeCost: 1, parallelism: 1 } as const;

interface ImportSummary {
  imported: number;
  failed: number;
  failures: Array<{ name: string; reason: string }>;
}

function formatImportSummary(result: ImportSummary, source: string): string {
  const head = `Imported ${result.imported} item(s) from ${source} (${result.failed} failed).`;
  if (result.failures.length === 0) return head;
  const names = result.failures
    .slice(0, 5)
    .map((f) => f.name)
    .join(', ');
  const rest = result.failures.length > 5 ? ` and ${result.failures.length - 5} more` : '';
  return `${head} Failed: ${names}${rest}.`;
}

export function App(): JSX.Element {
  const attach = useVaultStore((s) => s.attach);
  const client = useVaultStore((s) => s.client);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const items = useVaultStore((s) => s.items);
  const refresh = useVaultStore((s) => s.refresh);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FR-15 export/import
  const [showSettings, setShowSettings] = useState(false);
  const [exportPw, setExportPw] = useState('');
  const [exporting, setExporting] = useState(false);
  const [importPw, setImportPw] = useState('');
  const [importing, setImporting] = useState(false);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [pendingEncryptedFile, setPendingEncryptedFile] = useState<unknown | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const repo = new TauriStoreRepository();
    attach(createVaultClient(repo, { autoLockMs: 5 * 60 * 1000 }));
  }, [attach]);

  useEffect(() => {
    if (!isUnlocked) return;
    void refresh();
    void registerHotkeys(() => {
      // Focus the search input when the global shortcut fires.
      const input = document.querySelector<HTMLInputElement>('input[data-search]');
      input?.focus();
    });
    return () => {
      void unregisterHotkeys();
    };
  }, [isUnlocked, refresh]);

  const submit = async (): Promise<void> => {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const dir = await client.repo.getUserDirectoryEntry(email);
      if (dir) {
        const profile = await client.repo.getUserRecord(dir.id);
        if (!profile) throw new Error('User profile missing');
        await client.unlock({ email, masterPassword: password, kdfParams: profile.kdfParams });
      } else {
        await client.signUp({ email, masterPassword: password, kdfOverrides: fastKdf });
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string | undefined): Promise<void> => {
    if (!text) return;
    await writeText(text);
    setTimeout(() => {
      void writeText('');
    }, CLIPBOARD_CLEAR_MS);
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
        setImportInfo('Encrypted export detected — enter password.');
        return;
      }
      const items: ExportableItem[] = client.parseImport(text);
      const result = await client.importItems(items);
      setImportInfo(formatImportSummary(result, file.name));
      await refresh();
    } catch (parseErr) {
      setError((parseErr as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const filtered: DecryptedItem[] = query.trim()
    ? items.filter((i) => {
        const q = query.trim().toLowerCase();
        return (
          i.payload.name.toLowerCase().includes(q) ||
          (i.payload.username ?? '').toLowerCase().includes(q) ||
          (i.payload.url ?? '').toLowerCase().includes(q)
        );
      })
    : items;

  if (!client) return <div className="app"><main>Loading…</main></div>;

  if (!isUnlocked) {
    return (
      <div className="app">
        <header>
          <strong>123Pass</strong>
        </header>
        <main>
          <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
            <h2>Unlock vault</h2>
            <input
              aria-label="email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              aria-label="master-password"
              type="password"
              placeholder="Master password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" onClick={() => void submit()} disabled={busy || !email || !password}>
              {busy ? 'Working…' : 'Unlock / Sign up'}
            </button>
            {error ? <div role="alert" style={{ color: 'crimson' }}>{error}</div> : null}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <strong>123Pass</strong>
        <input
          data-search="true"
          aria-label="search"
          placeholder="Cmd/Ctrl+Shift+Space to focus"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={() => setShowSettings((s) => !s)} aria-pressed={showSettings}>
          {showSettings ? 'Vault' : 'Settings'}
        </button>
        <button
          type="button"
          onClick={() => {
            client.lock();
          }}
        >
          Lock
        </button>
      </header>
      <main>
        {showSettings ? (
          <section aria-label="Settings" style={{ maxWidth: 480, display: 'grid', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 16 }}>Export vault</h2>
              <p style={{ fontSize: 13, color: '#666' }}>
                Re-encrypts every item under an export password (≥12 chars), independent of the
                master password.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  aria-label="export-password"
                  type="password"
                  placeholder="Export password"
                  value={exportPw}
                  onChange={(e) => setExportPw(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={exporting || exportPw.length < 12}
                >
                  {exporting ? 'Exporting…' : 'Download .json'}
                </button>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: 16 }}>Import vault</h2>
              <p style={{ fontSize: 13, color: '#666' }}>
                123Pass encrypted .json · Bitwarden unencrypted .json · 1Password .csv
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
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <input
                    aria-label="import-password"
                    type="password"
                    placeholder="Export password"
                    value={importPw}
                    onChange={(e) => setImportPw(e.target.value)}
                    style={{ flex: 1 }}
                  />
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
                <div role="status" style={{ fontSize: 13, marginTop: 8 }}>
                  {importInfo}
                </div>
              ) : null}
              {error ? (
                <div role="alert" style={{ color: 'crimson', marginTop: 8, fontSize: 13 }}>
                  {error}
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {filtered.length === 0 ? <li>No items</li> : null}
            {filtered.map((item) => (
              <li
                key={item.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: '1px solid #eee',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{item.payload.name}</div>
                  {item.payload.username ? (
                    <div style={{ fontSize: 12, color: '#666' }}>{item.payload.username}</div>
                  ) : null}
                </div>
                {item.payload.username ? (
                  <button type="button" onClick={() => void copy(item.payload.username)}>
                    Copy user
                  </button>
                ) : null}
                {item.payload.password ? (
                  <button type="button" onClick={() => void copy(item.payload.password)}>
                    Copy pw
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
