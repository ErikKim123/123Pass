'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useVaultStore } from '@123pass/ui';

export default function SettingsPage(): JSX.Element {
  const client = useVaultStore((s) => s.client);
  const session = client?.currentSession?.();
  const lock = useVaultStore((s) => s.lock);
  const router = useRouter();
  const [rotating, setRotating] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    </main>
  );
}
