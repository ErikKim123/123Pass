// Admin app client — talks to Supabase via the same vault-sdk Supabase client,
// but never accesses ciphertext tables. All reads go through the admin_*
// security-definer RPCs defined in supabase/migrations/0009_admin.sql.
//
// Zero-knowledge invariant for the admin surface: this file's source must
// contain ZERO references to `from('encrypted_vault_items')`, `from('users')`
// (raw), or any other ciphertext-bearing table. Reviewers should be able to
// grep for those strings here and find none.

import { createSupabaseClient, type TypedSupabaseClient } from '@123pass/vault-sdk';

export interface AdminEnv {
  url: string;
  anonKey: string;
}

let cached: TypedSupabaseClient | null = null;

export function getAdminClient(env: AdminEnv): TypedSupabaseClient {
  if (cached) return cached;
  cached = createSupabaseClient({
    url: env.url,
    anonKey: env.anonKey,
    persistSession: true,
  });
  return cached;
}

export function resetAdminClient(): void {
  cached = null;
}

// ---------- Typed wrappers for the admin_* RPCs ----------

export interface UserStats {
  total_users: number;
  users_with_vault: number;
  total_vault_items: number;
  total_groups: number;
  total_shares: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  created_at: string;
  item_count: number;
  last_audit_at: string | null;
  recovery_enabled: boolean;
}

export interface AdminAuditEventRow {
  id: string;
  user_id: string;
  event_type: string;
  ip_hash: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminOrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  member_count: number;
  created_at: string;
}

function unwrapRpcError(opName: string, error: { message?: string } | null): never {
  throw new Error(`${opName} failed: ${error?.message ?? 'unknown'}`);
}

export async function fetchUserStats(client: TypedSupabaseClient): Promise<UserStats> {
  const sb = client as unknown as { rpc: (n: string, a?: unknown) => Promise<{ data: unknown; error: { message?: string } | null }> };
  const { data, error } = await sb.rpc('admin_get_user_stats');
  if (error) unwrapRpcError('admin_get_user_stats', error);
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? {
    total_users: 0,
    users_with_vault: 0,
    total_vault_items: 0,
    total_groups: 0,
    total_shares: 0,
  }) as UserStats;
}

export async function fetchUsers(
  client: TypedSupabaseClient,
  args: { search?: string; limit?: number; offset?: number } = {},
): Promise<AdminUserRow[]> {
  const sb = client as unknown as { rpc: (n: string, a?: unknown) => Promise<{ data: unknown; error: { message?: string } | null }> };
  const { data, error } = await sb.rpc('admin_list_users', {
    search_query: args.search ?? null,
    limit_count: args.limit ?? 50,
    offset_count: args.offset ?? 0,
  });
  if (error) unwrapRpcError('admin_list_users', error);
  return (data as AdminUserRow[] | null) ?? [];
}

export async function fetchAuditEvents(
  client: TypedSupabaseClient,
  args: { userId?: string; eventType?: string; limit?: number; offset?: number } = {},
): Promise<AdminAuditEventRow[]> {
  const sb = client as unknown as { rpc: (n: string, a?: unknown) => Promise<{ data: unknown; error: { message?: string } | null }> };
  const { data, error } = await sb.rpc('admin_list_audit_events', {
    search_user_id: args.userId ?? null,
    event_filter: args.eventType ?? null,
    limit_count: args.limit ?? 100,
    offset_count: args.offset ?? 0,
  });
  if (error) unwrapRpcError('admin_list_audit_events', error);
  return (data as AdminAuditEventRow[] | null) ?? [];
}

export async function fetchOrganizations(
  client: TypedSupabaseClient,
  args: { search?: string; limit?: number; offset?: number } = {},
): Promise<AdminOrganizationRow[]> {
  const sb = client as unknown as { rpc: (n: string, a?: unknown) => Promise<{ data: unknown; error: { message?: string } | null }> };
  const { data, error } = await sb.rpc('admin_list_organizations', {
    search_query: args.search ?? null,
    limit_count: args.limit ?? 50,
    offset_count: args.offset ?? 0,
  });
  if (error) unwrapRpcError('admin_list_organizations', error);
  return (data as AdminOrganizationRow[] | null) ?? [];
}

export async function checkIsAdmin(client: TypedSupabaseClient): Promise<boolean> {
  const sb = client as unknown as { rpc: (n: string, a?: unknown) => Promise<{ data: unknown; error: { message?: string } | null }> };
  const { data, error } = await sb.rpc('is_admin');
  if (error) return false;
  return Boolean(data);
}
