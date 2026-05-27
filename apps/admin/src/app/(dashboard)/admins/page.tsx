'use client';

import { useEffect, useState } from 'react';

import {
  checkIsSuperAdmin,
  fetchAdmins,
  getAdminClient,
  inviteAdmin,
  removeAdmin,
  updateAdminRole,
  type AdminRow,
} from '@/lib/admin-client';
import { env, hasLiveSupabase } from '@/lib/env';
import { MOCK_ADMINS } from '@/lib/mock-data';

type Role = 'super_admin' | 'support' | 'read_only';

const ROLE_BADGE: Record<Role, { bg: string; fg: string; label: string }> = {
  super_admin: { bg: '#fde7e7', fg: '#a10c0c', label: 'super_admin' },
  support: { bg: '#e5f7ed', fg: '#0a7a3a', label: 'support' },
  read_only: { bg: '#eef2ff', fg: '#3730a3', label: 'read_only' },
};

function RoleBadge({ role }: { role: Role }): JSX.Element {
  const c = ROLE_BADGE[role];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {c.label}
    </span>
  );
}

export default function AdminsPage(): JSX.Element {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [isSuper, setIsSuper] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('support');

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      if (!hasLiveSupabase) {
        setAdmins(MOCK_ADMINS);
        setIsSuper(true); // mock mode acts as super_admin for demo
      } else {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        const [list, isSup] = await Promise.all([
          fetchAdmins(client),
          checkIsSuperAdmin(client),
        ]);
        setAdmins(list);
        setIsSuper(isSup);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleInvite = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      if (hasLiveSupabase) {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        await inviteAdmin(client, {
          userId: inviteUserId.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
        });
      }
      setInfo(`Invited ${inviteEmail} as ${inviteRole}.`);
      setShowInvite(false);
      setInviteUserId('');
      setInviteEmail('');
      setInviteRole('support');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleChangeRole = async (a: AdminRow, newRole: Role): Promise<void> => {
    setError(null);
    setInfo(null);
    try {
      if (hasLiveSupabase) {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        await updateAdminRole(client, { userId: a.id, role: newRole });
      }
      setInfo(`Changed ${a.email}: ${a.role} → ${newRole}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRemove = async (a: AdminRow): Promise<void> => {
    if (!confirm(`Remove ${a.email} (${a.role}) from admin_users?`)) return;
    setError(null);
    setInfo(null);
    try {
      if (hasLiveSupabase) {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        await removeAdmin(client, a.id);
      }
      setInfo(`Removed ${a.email}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <h1 style={{ marginTop: 0 }}>Admins</h1>
      <p style={{ color: '#666', marginTop: -8 }}>
        Operator roster. Every change writes to <code>admin_action_logs</code> (visible on{' '}
        <a href="/audit">/audit</a>).{' '}
        {isSuper ? (
          <span style={{ color: '#0a7a3a' }}>You are a super_admin — full management access.</span>
        ) : (
          <span>Only super_admins can invite/change/remove rows.</span>
        )}
      </p>

      {info ? (
        <div role="status" style={{ padding: 10, background: '#e5f7ed', color: '#0a7a3a', borderRadius: 6, margin: '12px 0' }}>
          {info}
        </div>
      ) : null}
      {error ? (
        <div role="alert" style={{ padding: 10, background: '#fee', color: 'crimson', borderRadius: 6, margin: '12px 0' }}>
          {error}
        </div>
      ) : null}

      {isSuper ? (
        <div style={{ margin: '16px 0' }}>
          <button type="button" onClick={() => setShowInvite((v) => !v)}>
            {showInvite ? 'Cancel' : '+ Invite admin'}
          </button>
          {showInvite ? (
            <form
              onSubmit={handleInvite}
              style={{
                marginTop: 12,
                padding: 16,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                display: 'grid',
                gap: 10,
                maxWidth: 480,
              }}
            >
              <label>
                User UUID (from auth.users)
                <input
                  required
                  aria-label="invite-user-id"
                  value={inviteUserId}
                  onChange={(e) => setInviteUserId(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }}
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              </label>
              <label>
                Email
                <input
                  required
                  type="email"
                  aria-label="invite-email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
              <label>
                Role
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  <option value="super_admin">super_admin</option>
                  <option value="support">support</option>
                  <option value="read_only">read_only</option>
                </select>
              </label>
              <button type="submit">Invite</button>
            </form>
          ) : null}
        </div>
      ) : null}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
              <th>Created by</th>
              {isSuper ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 && !loading ? (
              <tr>
                <td colSpan={isSuper ? 5 : 4} style={{ color: '#888', padding: 24, textAlign: 'center' }}>
                  No admins. Use admin_bootstrap_first_super_admin RPC to create the first one.
                </td>
              </tr>
            ) : null}
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.email}</td>
                <td>
                  <RoleBadge role={a.role} />
                </td>
                <td>{new Date(a.created_at).toLocaleDateString()}</td>
                <td>
                  {a.created_by ? <code style={{ fontSize: 11 }}>{a.created_by.slice(0, 8)}…</code> : '—'}
                </td>
                {isSuper ? (
                  <td style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={a.role}
                      onChange={(e) => void handleChangeRole(a, e.target.value as Role)}
                      aria-label={`role-${a.id}`}
                      style={{ fontSize: 13 }}
                    >
                      <option value="super_admin">super_admin</option>
                      <option value="support">support</option>
                      <option value="read_only">read_only</option>
                    </select>
                    <button type="button" onClick={() => void handleRemove(a)}>
                      Remove
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>
        Mutations: <code>admin_invite_admin</code>, <code>admin_update_admin_role</code>,{' '}
        <code>admin_remove_admin</code>. Last super_admin protected against demotion/removal.
      </p>
    </>
  );
}
