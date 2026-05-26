'use client';

import { SecurityAudit, useAutoRefresh, useVaultStore } from '@123pass/ui';

export default function AuditPage(): JSX.Element {
  useAutoRefresh();
  const items = useVaultStore((s) => s.items);
  return (
    <main>
      <h1>Security Audit</h1>
      <SecurityAudit items={items} />
    </main>
  );
}
