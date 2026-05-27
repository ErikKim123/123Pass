'use client';

import { useEffect, useState } from 'react';

import {
  fetchUsers,
  getAdminClient,
  type AdminUserRow,
} from '@/lib/admin-client';
import { env, hasLiveSupabase } from '@/lib/env';
import { MOCK_USERS } from '@/lib/mock-data';

export default function UsersPage(): JSX.Element {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
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
              <th>Created</th>
              <th>Item count</th>
              <th>Last audit</th>
              <th>Recovery</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} style={{ color: '#888', padding: 24, textAlign: 'center' }}>
                  No users found.
                </td>
              </tr>
            ) : null}
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>{u.item_count.toLocaleString()}</td>
                <td>{u.last_audit_at ? new Date(u.last_audit_at).toLocaleString() : '—'}</td>
                <td>{u.recovery_enabled ? '✅' : '—'}</td>
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
