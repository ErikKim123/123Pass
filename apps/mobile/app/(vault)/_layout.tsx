import { Redirect, Stack } from 'expo-router';

import { useVaultStore } from '@/lib/vault-store';

export default function VaultLayout(): JSX.Element {
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const client = useVaultStore((s) => s.client);

  if (client && !isUnlocked) {
    return <Redirect href="/(auth)/login" />;
  }
  return <Stack />;
}
