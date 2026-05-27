'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LockScreen } from '@123pass/ui';

import { lookupKdfParams } from '@/lib/kdf-lookup';
import { getLastEmail } from '@/lib/last-email';

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [initialEmail, setInitialEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    const last = getLastEmail();
    if (last) setInitialEmail(last);
  }, []);

  return (
    <main style={{ maxWidth: 360, margin: '64px auto', padding: 16 }}>
      <h1>Unlock your vault</h1>
      <LockScreen
        lookupKdfParams={lookupKdfParams}
        onUnlocked={() => router.replace('/vault')}
        initialEmail={initialEmail}
      />
      <p style={{ marginTop: 16, fontSize: 14 }}>
        No account yet? <Link href="/signup">Create one</Link>
      </p>
      <p style={{ marginTop: 8, fontSize: 14 }}>
        Forgot master password? <Link href="/recover">Restore with recovery phrase</Link>
      </p>
    </main>
  );
}
