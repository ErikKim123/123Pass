'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { hasLiveSupabase } from '@/lib/env';

const NAV = [
  { href: '/metrics', label: 'Metrics' },
  { href: '/users', label: 'Users' },
  { href: '/audit', label: 'Audit log' },
  { href: '/orgs', label: 'Organizations' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const pathname = usePathname();
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 220,
          borderRight: '1px solid #e5e7eb',
          background: '#fff',
          padding: '20px 16px',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>123Pass Admin</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 24 }}>
          {hasLiveSupabase ? 'Live mode' : 'Mock mode'}
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map((n) => {
            const active = pathname?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  color: active ? '#fff' : '#333',
                  background: active ? '#0366d6' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div
          style={{
            marginTop: 32,
            padding: '12px',
            background: '#fff8e1',
            border: '1px solid #f3d98a',
            borderRadius: 6,
            fontSize: 12,
            color: '#7a5a00',
            lineHeight: 1.5,
          }}
        >
          <strong>Zero-knowledge boundary</strong>
          <br />
          Operators see metadata only. Vault ciphertext is never readable from this UI — every read
          goes through <code>admin_*</code> RPCs that emit aggregates / scrubbed rows.
        </div>
      </aside>
      <main style={{ flex: 1, padding: '24px 32px' }}>{children}</main>
    </div>
  );
}
