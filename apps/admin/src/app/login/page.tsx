'use client';

// Admin login. Reuses Supabase Auth — admins sign in with email + password just
// like customers, but the dashboard checks `is_admin()` before showing any
// data. In mock mode the dashboard is open (no auth gate).

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { checkIsAdmin, getAdminClient } from '@/lib/admin-client';
import { env, hasLiveSupabase } from '@/lib/env';

export default function AdminLoginPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!hasLiveSupabase) {
      // Mock mode — bypass login.
      router.replace('/metrics');
      return;
    }
    setBusy(true);
    try {
      const client = getAdminClient({
        url: env.NEXT_PUBLIC_SUPABASE_URL!,
        anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      });
      const sb = client as unknown as {
        auth: {
          signInWithPassword: (a: { email: string; password: string }) => Promise<{
            data: unknown;
            error: { message?: string } | null;
          }>;
        };
      };
      const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
      if (signInErr) throw new Error(signInErr.message ?? 'Sign-in failed');

      const isAdmin = await checkIsAdmin(client);
      if (!isAdmin) {
        throw new Error('This account is not in admin_users. Contact a super_admin.');
      }
      router.replace('/metrics');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 380, margin: '120px auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>123Pass Admin</h1>
      <p style={{ color: '#666', fontSize: 14 }}>
        Operator dashboard. Membership in <code>admin_users</code> required.
      </p>
      {!hasLiveSupabase ? (
        <div
          style={{
            margin: '16px 0',
            padding: 12,
            background: '#fff8e1',
            border: '1px solid #f3d98a',
            borderRadius: 6,
            fontSize: 13,
            color: '#7a5a00',
          }}
        >
          Mock mode — no Supabase env detected. Login is bypassed. Click <strong>Enter dashboard</strong>{' '}
          below to see synthetic data.
        </div>
      ) : null}
      <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label>
          Email
          <input
            aria-label="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required={hasLiveSupabase}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <label>
          Password
          <input
            aria-label="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={hasLiveSupabase}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : hasLiveSupabase ? 'Sign in' : 'Enter dashboard'}
        </button>
        {error ? (
          <div role="alert" style={{ color: 'crimson', fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </form>
    </main>
  );
}
