'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useVaultStore } from '@123pass/ui';

export default function Home(): JSX.Element {
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const client = useVaultStore((s) => s.client);
  const router = useRouter();

  useEffect(() => {
    if (!client) return;
    router.replace(isUnlocked ? '/vault' : '/login');
  }, [client, isUnlocked, router]);

  return <main style={{ padding: 24 }}>Redirecting…</main>;
}
