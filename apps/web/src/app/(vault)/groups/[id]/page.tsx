'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { GroupMembersPanel, InviteMemberDialog, useVaultStore } from '@123pass/ui';
import type { GroupSummary, RepoWrappedKey } from '@123pass/vault-sdk';
import { addItemToGroup, listGroupItems, listMyGroups } from '@123pass/vault-sdk';

interface DecryptedGroupItemView {
  id: string;
  name: string;
  username?: string;
}

export default function GroupDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const client = useVaultStore((s) => s.client);

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [items, setItems] = useState<DecryptedGroupItemView[]>([]);
  const [wrappedKey, setWrappedKey] = useState<RepoWrappedKey | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPw, setNewItemPw] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !client.isUnlocked() || !params.id) return;
    void (async () => {
      const groups = await listMyGroups({ repo: client.repo, session: client.currentSession() });
      const found = groups.find((g) => g.id === params.id);
      if (!found) {
        router.replace('/groups');
        return;
      }
      setGroup(found);
      // Re-fetch the wrapped key so we can pass it to InviteMemberDialog.
      const member = await client.repo.getGroupMember(found.id, client.currentSession().userId);
      if (member) setWrappedKey(member.wrapped_group_key);
      await reloadItems(found);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, params.id]);

  const reloadItems = async (g: GroupSummary): Promise<void> => {
    if (!client) return;
    const list = await listGroupItems({
      repo: client.repo,
      groupId: g.id,
      groupKey: g.groupKey,
    });
    setItems(
      list.map((i) => ({ id: i.id, name: i.payload.name, username: i.payload.username })),
    );
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!client || !group) return;
    setError(null);
    try {
      await addItemToGroup({
        repo: client.repo,
        groupId: group.id,
        groupKey: group.groupKey,
        payload: { name: newItemName, password: newItemPw },
        itemType: 'login',
      });
      setNewItemName('');
      setNewItemPw('');
      await reloadItems(group);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!group) return <main><p>Loading group…</p></main>;

  return (
    <main>
      <h1>{group.name}</h1>
      <p style={{ color: '#666' }}>Role: {group.role}</p>

      <GroupMembersPanel groupId={group.id} onInvite={() => setInviteOpen(true)} />

      <section>
        <h2>Group items ({items.length})</h2>
        <ul>
          {items.map((i) => (
            <li key={i.id} data-testid={`group-item-${i.id}`}>
              {i.name} {i.username ? <small>({i.username})</small> : null}
            </li>
          ))}
        </ul>
        <form onSubmit={submit} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <h3>Add new item to group</h3>
          <input
            aria-label="group-item-name"
            placeholder="Item name"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            required
          />
          <input
            aria-label="group-item-password"
            type="password"
            placeholder="Password"
            value={newItemPw}
            onChange={(e) => setNewItemPw(e.target.value)}
            required
          />
          <button type="submit" disabled={!newItemName || !newItemPw}>Add</button>
          {error ? <div role="alert">{error}</div> : null}
        </form>
      </section>

      {wrappedKey ? (
        <InviteMemberDialog
          open={inviteOpen}
          groupId={group.id}
          callerWrappedGroupKey={wrappedKey}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
    </main>
  );
}
