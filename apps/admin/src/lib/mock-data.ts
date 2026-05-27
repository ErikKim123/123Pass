// Synthetic admin-side data for env-less local development. Lets reviewers
// see the dashboard without a Supabase project. Numbers are stable per page
// load so the UI doesn't flicker.

import type {
  AdminAuditEventRow,
  AdminOrganizationRow,
  AdminUserRow,
  UserStats,
} from './admin-client';

export const MOCK_STATS: UserStats = {
  total_users: 1247,
  users_with_vault: 1183,
  total_vault_items: 38492,
  total_groups: 217,
  total_shares: 1054,
};

export const MOCK_USERS: AdminUserRow[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alice@example.com',
    created_at: '2026-04-12T08:22:00Z',
    item_count: 142,
    last_audit_at: '2026-05-26T19:04:00Z',
    recovery_enabled: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'bob@example.com',
    created_at: '2026-04-15T11:48:00Z',
    item_count: 87,
    last_audit_at: '2026-05-27T03:11:00Z',
    recovery_enabled: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'carol@example.com',
    created_at: '2026-05-01T15:30:00Z',
    item_count: 23,
    last_audit_at: '2026-05-25T09:18:00Z',
    recovery_enabled: false,
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'dave@example.com',
    created_at: '2026-05-20T07:00:00Z',
    item_count: 5,
    last_audit_at: null,
    recovery_enabled: true,
  },
];

export const MOCK_AUDIT: AdminAuditEventRow[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000001',
    event_type: 'master_pw_changed',
    ip_hash: 'sha256:9a1c…',
    user_agent: 'Mozilla/5.0 (Macintosh) Chrome/126',
    metadata: { itemCount: 142 },
    created_at: '2026-05-26T19:04:00Z',
  },
  {
    id: 'a0000000-0000-0000-0000-000000000002',
    user_id: '00000000-0000-0000-0000-000000000002',
    event_type: 'share_accepted',
    ip_hash: 'sha256:7e22…',
    user_agent: 'Mozilla/5.0 (Windows) Firefox/128',
    metadata: { fromUserId: '00000000-0000-0000-0000-000000000001' },
    created_at: '2026-05-27T03:11:00Z',
  },
  {
    id: 'a0000000-0000-0000-0000-000000000003',
    user_id: '00000000-0000-0000-0000-000000000003',
    event_type: 'login',
    ip_hash: 'sha256:31ab…',
    user_agent: 'Mozilla/5.0 (iPhone) Safari/17',
    metadata: { method: 'biometric' },
    created_at: '2026-05-25T09:18:00Z',
  },
];

export const MOCK_ORGS: AdminOrganizationRow[] = [
  {
    id: 'b0000000-0000-0000-0000-000000000001',
    name: 'Acme Corp',
    slug: 'acme',
    status: 'active',
    member_count: 32,
    created_at: '2026-03-08T10:00:00Z',
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    name: 'Globex',
    slug: 'globex',
    status: 'active',
    member_count: 8,
    created_at: '2026-04-22T14:15:00Z',
  },
  {
    id: 'b0000000-0000-0000-0000-000000000003',
    name: 'Initech',
    slug: 'initech',
    status: 'suspended',
    member_count: 14,
    created_at: '2026-05-05T16:42:00Z',
  },
];
