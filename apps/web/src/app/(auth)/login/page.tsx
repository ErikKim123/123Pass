'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { LockScreen } from '@123pass/ui';

import { lookupKdfParams } from '@/lib/kdf-lookup';

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  return (
    <main style={{ maxWidth: 360, margin: '64px auto', padding: 16 }}>
      <h1>Unlock your vault</h1>
      <LockScreen
        lookupKdfParams={lookupKdfParams}
        onUnlocked={() => router.replace('/vault')}
      />
      <p style={{ marginTop: 16, fontSize: 14 }}>
        No account yet? <Link href="/signup">Create one</Link>
      </p>
    </main>
  );
}
