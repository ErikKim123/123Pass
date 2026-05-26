'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CreateGroupDialog, GroupList } from '@123pass/ui';
import type { GroupSummary } from '@123pass/vault-sdk';

export default function GroupsPage(): JSX.Element {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const handleSelect = (group: GroupSummary): void => {
    router.push(`/groups/${group.id}`);
  };

  return (
    <main>
      <h1>Groups</h1>
      <GroupList
        key={reloadKey}
        onSelect={handleSelect}
        onCreate={() => setDialogOpen(true)}
      />
      <CreateGroupDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
      />
    </main>
  );
}
