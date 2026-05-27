'use client';

// Recovery flow — user enters their 24-word BIP39 phrase to validate they own
// the vault. Currently the page only validates the phrase shape (RecoveryFlow
// runs isValidRecoveryPhrase). Full recovery (re-derive vaultKey from the seed
// and reset the master password via rotate_master_password) is a follow-up
// once the server-side recovery RPC is implemented.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { RecoveryFlow } from '@123pass/ui';

export default function RecoverPage(): JSX.Element {
  const router = useRouter();
  const [phaseDone, setPhaseDone] = useState(false);

  if (phaseDone) {
    return (
      <main style={{ maxWidth: 480, margin: '64px auto', padding: 16 }}>
        <h1>Phrase verified</h1>
        <p>
          Your recovery phrase is valid. Master-password reset is still being implemented — for now
          you can still sign in with your existing master password.
        </p>
        <p style={{ marginTop: 16, fontSize: 14 }}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: '64px auto', padding: 16 }}>
      <h1>Restore vault from recovery phrase</h1>
      <p>
        Type the 24 words you saved at signup. The phrase never leaves this device — verification
        happens locally.
      </p>
      <RecoveryFlow
        mode="restore"
        onConfirmed={() => {
          setPhaseDone(true);
          // Navigation suggestion — caller can choose to redirect to a reset-password screen
          // once that flow exists.
          router.prefetch?.('/login');
        }}
      />
      <p style={{ marginTop: 16, fontSize: 14 }}>
        Remember your master password after all? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
