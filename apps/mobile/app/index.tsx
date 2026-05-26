import { Redirect } from 'expo-router';

import { useVaultStore } from '@/lib/vault-store';

export default function Index(): JSX.Element {
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  return <Redirect href={isUnlocked ? '/(vault)' : '/(auth)/login'} />;
}
