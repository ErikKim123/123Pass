'use client';

import { useEffect, useState } from 'react';

import {
  fetchAuditEvents,
  getAdminClient,
  type AdminAuditEventRow,
} from '@/lib/admin-client';
import { env, hasLiveSupabase } from '@/lib/env';
import { MOCK_AUDIT } from '@/lib/mock-data';

const EVENT_TYPES = ['', 'login', 'master_pw_changed', 'share_accepted', 'item_created', 'item_deleted'] as const;

export default function AuditPage(): JSX.Element {
  const [events, setEvents] = useState<AdminAuditEventRow[]>([]);
  const [eventType, setEventType] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      if (!hasLiveSupabase) {
        let filtered = MOCK_AUDIT;
        if (eventType) filtered = filtered.filter((e) => e.event_type === eventType);
        if (userId) filtered = filtered.filter((e) => e.user_id === userId.trim());
        setEvents(filtered);
      } else {
        const client = getAdminClient({
          url: env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        });
        setEvents(
          await fetchAuditEvents(client, {
            userId: userId.trim() || undefined,
            eventType: eventType || undefined,
          }),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <h1 style={{ marginTop: 0 }}>Audit log</h1>
      <p style={{ color: '#666', marginTop: -8 }}>
        Every event ships metadata only — <code>ip_hash</code> is SHA-256 truncated, never raw IP.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}
      >
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t || 'All events'}
            </option>
          ))}
        </select>
        <input
          aria-label="user-id"
          placeholder="Filter by user id (uuid)…"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          style={{ flex: 1, maxWidth: 380 }}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Filter'}
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
              <th>When</th>
              <th>User</th>
              <th>Event</th>
              <th>IP hash</th>
              <th>UA</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} style={{ color: '#888', padding: 24, textAlign: 'center' }}>
                  No events found.
                </td>
              </tr>
            ) : null}
            {events.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString()}</td>
                <td>
                  <code style={{ fontSize: 11 }}>{e.user_id.slice(0, 8)}…</code>
                </td>
                <td>{e.event_type}</td>
                <td>{e.ip_hash ? <code style={{ fontSize: 11 }}>{e.ip_hash}</code> : '—'}</td>
                <td style={{ fontSize: 12, color: '#666' }}>{e.user_agent ?? '—'}</td>
                <td style={{ fontSize: 12, fontFamily: 'monospace' }}>
                  {JSON.stringify(e.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>
        Source: <code>admin_list_audit_events(user_id, event_type, limit, offset)</code>
      </p>
    </>
  );
}
