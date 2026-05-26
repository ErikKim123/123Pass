import { useEffect, useState } from 'react';

import type { GroupMembersRow } from '@123pass/vault-sdk';

import { useVaultStore } from '../stores/vault-store';

export interface GroupMembersPanelProps {
  groupId: string;
  className?: string;
  onInvite?: () => void;
}

export function GroupMembersPanel({
  groupId,
  className,
  onInvite,
}: GroupMembersPanelProps): JSX.Element {
  const client = useVaultStore((s) => s.client);
  const [members, setMembers] = useState<GroupMembersRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = (): void => {
    if (!client) return;
    setLoading(true);
    void client.repo
      .listGroupMembers(groupId)
      .then(setMembers)
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [client, groupId]);

  const remove = async (userId: string): Promise<void> => {
    if (!client) return;
    setError(null);
    try {
      await client.repo.removeGroupMember(groupId, userId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className={className} data-testid="group-members">
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h3>Members ({members.length})</h3>
        <button type="button" onClick={onInvite}>+ Invite</button>
      </header>
      {loading ? <p>Loading…</p> : null}
      {error ? <div role="alert">{error}</div> : null}
      <ul>
        {members.map((m) => (
          <li key={m.user_id} data-testid={`member-${m.user_id}`}>
            <span><code>{m.user_id.slice(0, 12)}…</code></span>
            <span style={{ marginLeft: 8, color: '#666' }}>({m.role})</span>
            {m.role !== 'owner' ? (
              <button type="button" onClick={() => void remove(m.user_id)} style={{ marginLeft: 8 }}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
