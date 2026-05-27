'use client';

import { useEffect, useState } from 'react';

import {
  createOrg,
  fetchOrganizations,
  getAdminClient,
  updateOrgStatus,
  type AdminOrganizationRow,
} from '@/lib/admin-client';
import { env, hasLiveSupabase } from '@/lib/env';
import { MOCK_ORGS } from '@/lib/mock-data';

type OrgStatus = 'active' | 'suspended' | 'deleted';

function StatusBadge({ status }: { status: string }): JSX.Element {
  const colors: Record<string, { bg: string; fg: string }> = {
    active: { bg: '#e5f7ed', fg: '#0a7a3a' },
    suspended: { bg: '#fff3e0', fg: '#a85b00' },
    deleted: { bg: '#fde7e7', fg: '#a10c0c' },
  };
  const c = colors[status] ?? { bg: '#eee', fg: '#555' };
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
      {status}
    </span>
  );
}

export default function OrgsPage(): JSX.Element {
  const [orgs, setOrgs] = useState<AdminOrganizationRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newOwner, setNewOwner] = useState('');

  const load = async (query: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      if (!hasLiveSupabase) {
        const filtered = query
          ? MOCK_ORGS.filter(
              (o) =>
                o.name.toLowerCase().includes(query.toLowerCase()) ||
                o.slug.includes(query.toLowerCase()),
            )
          : MOCK_ORGS;
        setOrgs(filtered);
      } else {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        setOrgs(await fetchOrganizations(client, { search: query || undefined }));
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

  const handleCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      if (hasLiveSupabase) {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        await createOrg(client, {
          name: newName.trim(),
          slug: newSlug.trim(),
          ownerId: newOwner.trim(),
        });
      }
      setInfo(`Created org "${newName}" (slug: ${newSlug}).`);
      setShowCreate(false);
      setNewName('');
      setNewSlug('');
      setNewOwner('');
      await load(search);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleStatusChange = async (org: AdminOrganizationRow, status: OrgStatus): Promise<void> => {
    setError(null);
    setInfo(null);
    try {
      if (hasLiveSupabase) {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        await updateOrgStatus(client, { orgId: org.id, status });
      }
      setInfo(`${org.name}: ${org.status} → ${status}.`);
      await load(search);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <h1 style={{ marginTop: 0 }}>Organizations</h1>
      <p style={{ color: '#666', marginTop: -8 }}>
        B2B tenancy unit. Member emails not surfaced here — go to <a href="/users">Users</a> for
        individual lookups.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0', alignItems: 'center' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(search);
          }}
          style={{ display: 'flex', gap: 8, flex: 1 }}
        >
          <input
            aria-label="search"
            placeholder="Search by name or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, maxWidth: 320 }}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'Search'}
          </button>
        </form>
        <button type="button" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ Create org'}
        </button>
      </div>

      {showCreate ? (
        <form
          onSubmit={handleCreate}
          style={{
            padding: 16,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            display: 'grid',
            gap: 10,
            maxWidth: 480,
            marginBottom: 16,
          }}
        >
          <label>
            Name
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Slug (a-z, 0-9, -; 3-40 chars)
            <input
              required
              pattern="[a-z0-9-]{3,40}"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Owner UUID (auth.users.id)
            <input
              required
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
              style={{ width: '100%', marginTop: 4 }}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </label>
          <button type="submit">Create</button>
        </form>
      ) : null}

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
              <th>Name</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Members</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} style={{ color: '#888', padding: 24, textAlign: 'center' }}>
                  No organizations found.
                </td>
              </tr>
            ) : null}
            {orgs.map((o) => (
              <tr key={o.id}>
                <td style={{ fontWeight: 500 }}>{o.name}</td>
                <td>
                  <code>{o.slug}</code>
                </td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td>{o.member_count.toLocaleString()}</td>
                <td>{new Date(o.created_at).toLocaleDateString()}</td>
                <td>
                  <select
                    aria-label={`status-${o.id}`}
                    value={o.status}
                    onChange={(e) => void handleStatusChange(o, e.target.value as OrgStatus)}
                    style={{ fontSize: 13 }}
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="deleted">deleted</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>
        Source: <code>admin_list_organizations(search_query, limit, offset)</code>
      </p>
    </>
  );
}
