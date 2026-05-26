'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useVaultStore } from '@123pass/ui';

export function AuthGuard({ children }: { children: React.ReactNode }): JSX.Element | null {
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const client = useVaultStore((s) => s.client);
  const router = useRouter();

  useEffect(() => {
    if (client && !isUnlocked) {
      router.replace('/login');
    }
  }, [client, isUnlocked, router]);

  if (!client || !isUnlocked) return null;
  return <>{children}</>;
}
