'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useVaultStore } from '@123pass/ui';

import { AuthGuard } from '@/components/AuthGuard';

export default function VaultLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const lock = useVaultStore((s) => s.lock);
  const client = useVaultStore((s) => s.client);
  const router = useRouter();

  const signOut = async (): Promise<void> => {
    if (client) {
      await client.signOutFully();
    } else {
      lock();
    }
    router.replace('/login');
  };

  return (
    <AuthGuard>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: 16,
          borderBottom: '1px solid #ddd',
        }}
      >
        <Link href="/vault" style={{ fontWeight: 600 }}>
          123Pass
        </Link>
        <nav style={{ display: 'flex', gap: 12, fontSize: 14 }}>
          <Link href="/vault">Vault</Link>
          <Link href="/vault/audit">Audit</Link>
          <Link href="/shares">Shares</Link>
          <Link href="/groups">Groups</Link>
          <Link href="/settings">Settings</Link>
        </nav>
        <button
          type="button"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            lock();
            router.replace('/login');
          }}
        >
          Lock
        </button>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <div style={{ padding: 16 }}>{children}</div>
    </AuthGuard>
  );
}
