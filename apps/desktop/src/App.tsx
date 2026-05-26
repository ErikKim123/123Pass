import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useEffect, useState } from 'react';

import { CLIPBOARD_CLEAR_MS } from '@123pass/shared';
import { useVaultStore } from '@123pass/ui';
import type { DecryptedItem } from '@123pass/vault-sdk';
import { createVaultClient } from '@123pass/vault-sdk';

import { registerHotkeys, unregisterHotkeys } from '@/lib/hotkeys';
import { TauriStoreRepository } from '@/lib/tauri-repo';

const fastKdf = { memoryCost: 8192, timeCost: 1, parallelism: 1 } as const;

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
      </main>
    </div>
  );
}
