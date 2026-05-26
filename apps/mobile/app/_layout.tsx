import '@/lib/crypto-polyfill';

import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { createVaultClient } from '@123pass/vault-sdk';

import { SecureStoreRepository } from '@/lib/secure-store-repo';
import { useVaultStore } from '@/lib/vault-store';

export default function RootLayout(): JSX.Element {
  const attach = useVaultStore((s) => s.attach);

  useEffect(() => {
    const repo = new SecureStoreRepository();
    attach(createVaultClient(repo, { autoLockMs: 5 * 60 * 1000 }));
  }, [attach]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
