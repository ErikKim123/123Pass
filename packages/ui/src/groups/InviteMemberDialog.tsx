import { useState, type FormEvent } from 'react';

import { inviteGroupMember, type RepoWrappedKey } from '@123pass/vault-sdk';

import { useVaultStore } from '../stores/vault-store';

export interface InviteMemberDialogProps {
  open: boolean;
  groupId: string;
  callerWrappedGroupKey: RepoWrappedKey;
  onClose: () => void;
  onInvited?: () => void;
}

export function InviteMemberDialog({
  open,
  groupId,
  callerWrappedGroupKey,
  onClose,
  onInvited,
}: InviteMemberDialogProps): JSX.Element | null {
  const client = useVaultStore((s) => s.client);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!client) return;
    setError(null);
    setBusy(true);
    try {
      await inviteGroupMember({
        repo: client.repo,
        session: client.currentSession(),
        groupId,
        recipientEmail: email,
        role,
        callerWrappedGroupKey,
      });
      setEmail('');
      onInvited?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Invite member"
      data-testid="invite-member-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <form
        onSubmit={submit}
        style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 320 }}
      >
        <h2 style={{ marginTop: 0 }}>Invite member</h2>
        <label>
          Email
          <input
            aria-label="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <fieldset style={{ border: 'none', padding: 0 }}>
          <legend>Role</legend>
          <label>
            <input
              type="radio"
              name="role"
              value="member"
              checked={role === 'member'}
              onChange={() => setRole('member')}
            />
            Member
          </label>
          <label>
            <input
              type="radio"
              name="role"
              value="admin"
              checked={role === 'admin'}
              onChange={() => setRole('admin')}
            />
            Admin
          </label>
        </fieldset>
        {error ? <div role="alert" style={{ color: 'crimson' }}>{error}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" disabled={busy || !email}>
            {busy ? 'Inviting…' : 'Invite'}
          </button>
        </div>
      </form>
    </div>
  );
}
