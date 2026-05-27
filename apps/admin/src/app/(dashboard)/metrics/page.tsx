'use client';

import { useEffect, useState } from 'react';

import { fetchUserStats, getAdminClient, type UserStats } from '@/lib/admin-client';
import { env, hasLiveSupabase } from '@/lib/env';
import { MOCK_STATS } from '@/lib/mock-data';

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }): JSX.Element {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 20,
        minWidth: 200,
      }}
    >
      <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

export default function MetricsPage(): JSX.Element {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasLiveSupabase) {
      setStats(MOCK_STATS);
      setLoading(false);
      return;
    }
    const client = getAdminClient({
      url: env.NEXT_PUBLIC_SUPABASE_URL!,
      anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    });
    void fetchUserStats(client)
      .then(setStats)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h1 style={{ marginTop: 0 }}>Metrics</h1>
      <p style={{ color: '#666', marginTop: -8 }}>
        Aggregate counts only. Individual ciphertext is never read here.
      </p>

      {loading ? <p>Loading…</p> : null}
      {error ? (
        <div role="alert" style={{ color: 'crimson', padding: 12, background: '#fee', borderRadius: 6 }}>
          {error}
        </div>
      ) : null}

      {stats ? (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 24 }}>
          <StatCard label="Total users" value={stats.total_users.toLocaleString()} />
          <StatCard
            label="Active vaults"
            value={stats.users_with_vault.toLocaleString()}
            hint={`${Math.round((stats.users_with_vault / Math.max(stats.total_users, 1)) * 100)}% of users`}
          />
          <StatCard label="Total vault items" value={stats.total_vault_items.toLocaleString()} />
          <StatCard label="Groups" value={stats.total_groups.toLocaleString()} />
          <StatCard label="Shares" value={stats.total_shares.toLocaleString()} />
        </div>
      ) : null}

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16 }}>Source</h2>
        <p style={{ fontSize: 13, color: '#555' }}>
          Numbers come from <code>admin_get_user_stats()</code> (SQL function with{' '}
          <code>SECURITY DEFINER</code>). The function returns five aggregate counts and never
          exposes ciphertext, kdf_params, or emails to non-admin callers.
        </p>
      </section>
    </>
  );
}
