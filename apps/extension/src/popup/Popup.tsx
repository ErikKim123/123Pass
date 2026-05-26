// Design Ref: §5.4 Browser Extension Popup checklist.
// Locked state: master-PW form.
// Unlocked state: domain-matched items + Autofill + Generate + Open Vault.

import { useEffect, useMemo, useState } from 'react';

import { PasswordGenerator, useVaultStore } from '@123pass/ui';
import type { DecryptedItem } from '@123pass/vault-sdk';
import { createVaultClient } from '@123pass/vault-sdk';

import { ChromeStorageRepository } from '@/lib/ext-repo';
import { sendToActiveTab, type AutofillPayload } from '@/lib/messaging';
import { domainMatches, getActiveTab } from '@/shared/current-tab';

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
        <button
          type="button"
          onClick={() => {
            client.lock();
            window.close();
          }}
        >
          Lock
        </button>
      </header>
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
                  <small style={{ color: '#666' }}>{item.payload.username ?? '(no username)'}</small>
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
    </section>
  );
}
