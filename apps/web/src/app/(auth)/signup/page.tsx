'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { RecoveryFlow, useVaultStore } from '@123pass/ui';

import { cacheKdfParams } from '@/lib/kdf-lookup';
import { signUpAndUnlockArgsSchema } from '@/lib/signup-schema';

type Step = 'form' | 'recovery';

export default function SignupPage(): JSX.Element {
  const client = useVaultStore((s) => s.client);
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    const parsed = signUpAndUnlockArgsSchema.safeParse({ email, password, confirm });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Invalid input');
      return;
    }
    if (!client) {
      setError('Vault client not ready. Refresh the page.');
      return;
    }
    setLoading(true);
    try {
      await client.signUp({ email, masterPassword: password });
      // Cache KDF params so login page can find them next time.
      const userId = client.currentSession().userId;
      const repo = client.repo;
      const user = await repo.getUserRecord(userId);
      if (user) cacheKdfParams(email, user.kdfParams);
      setStep('recovery');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'recovery') {
    return (
      <main style={{ maxWidth: 480, margin: '64px auto', padding: 16 }}>
        <h1>Save your recovery phrase</h1>
        <p>
          This 24-word phrase is the ONLY way to recover your vault if you forget your master
          password. Anyone with this phrase can decrypt your vault — store it offline.
        </p>
        <RecoveryFlow mode="generate" onConfirmed={() => router.replace('/vault')} />
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 360, margin: '64px auto', padding: 16 }}>
      <h1>Create your vault</h1>
      <form onSubmit={submit} aria-label="Sign up">
        <label>
          Email
          <input
            aria-label="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Master Password
          <input
            aria-label="master-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label>
          Confirm Master Password
          <input
            aria-label="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create vault'}
        </button>
        {error ? (
          <div role="alert" data-testid="signup-error">
            {error}
          </div>
        ) : null}
      </form>
      <p style={{ marginTop: 16, fontSize: 14 }}>
        Have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
