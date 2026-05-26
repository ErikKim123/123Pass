'use client';

import { IncomingSharesList } from '@123pass/ui';

export default function SharesPage(): JSX.Element {
  return (
    <main>
      <h1>Shares</h1>
      <p style={{ color: '#666' }}>Items other users have shared with you.</p>
      <IncomingSharesList />
    </main>
  );
}
