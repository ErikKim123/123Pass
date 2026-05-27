// Design Ref: §5.4 Login Page UI Checklist.

import { useState, type FormEvent } from 'react';

import type { KdfParams } from '@123pass/shared';

import { useVaultStore } from '../stores/vault-store';

export interface LockScreenProps {
  /**
   * Function the host app provides to look up KDF params for an email BEFORE sign-in.
   * Usually backed by an unauthenticated Supabase edge function or a cached value.
   */
  lookupKdfParams: (email: string) => Promise<KdfParams>;
  onUnlocked?: () => void;
  className?: string;
  /**
   * Pre-fill the email field — used when a Supabase Auth session is still alive
   * but the vault key has been wiped (lock-without-signOut, page reload).
   */
  initialEmail?: string;
}

export function LockScreen({
  lookupKdfParams,
  onUnlocked,
  className,
  initialEmail,
}: LockScreenProps): JSX.Element {
  const unlock = useVaultStore((s) => s.unlock);
  const loading = useVaultStore((s) => s.loading);
  const storeError = useVaultStore((s) => s.error);

  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setLocalError(null);
    try {
      const kdfParams = await lookupKdfParams(email);
      await unlock(email, password, kdfParams);
      onUnlocked?.();
    } catch (err) {
      // Identical message regardless of the underlying cause — see Design §6.1.
      setLocalError('Email or master password is incorrect');
    }
  };

  const error = localError ?? storeError;

  return (
    <form
      onSubmit={submit}
      className={className}
      data-testid="lock-screen"
      aria-label="Unlock vault"
    >
      <label>
        Email
        <input
          aria-label="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Master Password
        <input
          aria-label="master-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button type="submit" disabled={loading || !email || !password} data-testid="unlock-button">
        {loading ? 'Unlocking…' : 'Unlock'}
      </button>
      {error ? (
        <div role="alert" data-testid="lock-error">
          {error}
        </div>
      ) : null}
    </form>
  );
}
