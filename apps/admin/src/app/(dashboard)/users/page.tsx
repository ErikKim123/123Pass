'use client';

import { useEffect, useState } from 'react';

import {
  fetchUsers,
  getAdminClient,
  restoreUser,
  scheduleUserDeletion,
  suspendUser,
  type AdminUserRow,
} from '@/lib/admin-client';
import { env, hasLiveSupabase } from '@/lib/env';
import { MOCK_USERS } from '@/lib/mock-data';

function StatusBadge({ status }: { status: AdminUserRow['status'] }): JSX.Element {
  const colors: Record<AdminUserRow['status'], { bg: string; fg: string }> = {
    active: { bg: '#e5f7ed', fg: '#0a7a3a' },
    suspended: { bg: '#fff3e0', fg: '#a85b00' },
    pending_deletion: { bg: '#fde7e7', fg: '#a10c0c' },
  };
  const c = colors[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      {status}
    </span>
  );
}

export default function UsersPage(): JSX.Element {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (query: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      if (!hasLiveSupabase) {
        const filtered = query
          ? MOCK_USERS.filter((u) => u.email.includes(query.toLowerCase()))
          : MOCK_USERS;
        setUsers(filtered);
      } else {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        setUsers(await fetchUsers(client, { search: query || undefined }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load('');
  }, []);

  const runAction = async (
    fn: () => Promise<void>,
    successMsg: string,
  ): Promise<void> => {
    setError(null);
    setInfo(null);
    try {
      await fn();
      setInfo(successMsg);
      await load(search);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleSuspend = async (u: AdminUserRow): Promise<void> => {
    const reason = prompt(`Suspend ${u.email}. Reason (optional):`) ?? undefined;
    if (reason === null) return;
    await runAction(async () => {
      if (hasLiveSupabase) {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        await suspendUser(client, { userId: u.id, reason });
      }
    }, `Suspended ${u.email}.`);
  };

  const handleRestore = async (u: AdminUserRow): Promise<void> => {
    await runAction(async () => {
      if (hasLiveSupabase) {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        await restoreUser(client, u.id);
      }
    }, `Restored ${u.email}.`);
  };

  const handleScheduleDeletion = async (u: AdminUserRow): Promise<void> => {
    if (
      !confirm(
        `Schedule deletion of ${u.email}? Their account will enter a 30-day grace period before vault data is purged.`,
      )
    ) return;
    await runAction(async () => {
      if (hasLiveSupabase) {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        await scheduleUserDeletion(client, u.id);
      }
    }, `${u.email} scheduled for deletion (30-day grace).`);
  };

  return (
    <>
      <h1 style={{ marginTop: 0 }}>Users</h1>
      <p style={{ color: '#666', marginTop: -8 }}>
        Email and metadata only. <code>kdf_params</code>, <code>encrypted_private_key</code>, and
        vault ciphertext are never returned.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(search);
        }}
        style={{ display: 'flex', gap: 8, margin: '16px 0' }}
      >
        <input
          aria-label="search"
          placeholder="Search by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 320 }}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </form>

      {info ? (
        <div role="status" style={{ padding: 10, background: '#e5f7ed', color: '#0a7a3a', borderRadius: 6, marginBottom: 12 }}>
          {info}
        </div>
      ) : null}
      {error ? (
        <div role="alert" style={{ color: 'crimson', padding: 12, background: '#fee', borderRadius: 6 }}>
          {error}
        </div>
      ) : null}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Status</th>
              <th>Created</th>
              <th>Items</th>
              <th>Last audit</th>
              <th>Recovery</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} style={{ color: '#888', padding: 24, textAlign: 'center' }}>
                  No users found.
                </td>
              </tr>
            ) : null}
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>
                  <StatusBadge status={u.status} />
                </td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>{u.item_count.toLocaleString()}</td>
                <td>{u.last_audit_at ? new Date(u.last_audit_at).toLocaleString() : '—'}</td>
                <td>{u.recovery_enabled ? '✅' : '—'}</td>
                <td style={{ display: 'flex', gap: 4 }}>
                  {u.status === 'active' ? (
                    <button type="button" onClick={() => void handleSuspend(u)}>
                      Suspend
                    </button>
                  ) : null}
                  {u.status !== 'active' ? (
                    <button type="button" onClick={() => void handleRestore(u)}>
                      Restore
                    </button>
                  ) : null}
                  {u.status !== 'pending_deletion' ? (
                    <button type="button" onClick={() => void handleScheduleDeletion(u)}>
                      Delete
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>
        Source: <code>admin_list_users(search_query, limit, offset)</code>
      </p>
    </>
  );
}
