import { useEffect, useState } from 'react';

import { listMyGroups, type GroupSummary } from '@123pass/vault-sdk';

import { useVaultStore } from '../stores/vault-store';

export interface GroupListProps {
  onSelect?: (group: GroupSummary) => void;
  onCreate?: () => void;
  className?: string;
}

export function GroupList({ onSelect, onCreate, className }: GroupListProps): JSX.Element {
  const client = useVaultStore((s) => s.client);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client || !client.isUnlocked()) return;
    setLoading(true);
    void listMyGroups({ repo: client.repo, session: client.currentSession() })
      .then(setGroups)
      .finally(() => setLoading(false));
  }, [client]);

  return (
    <section className={className} data-testid="group-list">
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>My groups ({groups.length})</h2>
        <button type="button" onClick={onCreate}>+ New group</button>
      </header>
      {loading ? <p>Loading…</p> : null}
      {!loading && groups.length === 0 ? (
        <p data-testid="no-groups">You are not a member of any group yet.</p>
      ) : null}
      <ul>
        {groups.map((g) => (
          <li key={g.id} data-testid={`group-${g.id}`}>
            <button type="button" onClick={() => onSelect?.(g)}>
              <span>{g.name}</span>
              <small style={{ marginLeft: 8, color: '#666' }}>({g.role})</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
