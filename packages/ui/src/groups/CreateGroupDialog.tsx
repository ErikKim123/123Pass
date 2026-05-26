import { useState, type FormEvent } from 'react';

import { createGroup, type GroupSummary } from '@123pass/vault-sdk';

import { useVaultStore } from '../stores/vault-store';

export interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (group: GroupSummary) => void;
}

export function CreateGroupDialog({
  open,
  onClose,
  onCreated,
}: CreateGroupDialogProps): JSX.Element | null {
  const client = useVaultStore((s) => s.client);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!client) return;
    setError(null);
    setBusy(true);
    try {
      const group = await createGroup({
        repo: client.repo,
        session: client.currentSession(),
        name,
      });
      setName('');
      onCreated?.(group);
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
      aria-label="New group"
      data-testid="create-group-dialog"
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
        <h2 style={{ marginTop: 0 }}>New group</h2>
        <label>
          Group name
          <input
            aria-label="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Family"
            required
          />
        </label>
        {error ? <div role="alert" style={{ color: 'crimson' }}>{error}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !name}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
