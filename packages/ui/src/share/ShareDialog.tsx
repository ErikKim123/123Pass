// Design Ref: §FR-11 — share an item with another user.
// vault-sdk handles all crypto; this component only collects the recipient email + permission.

import { useState, type FormEvent } from 'react';

import { useVaultStore } from '../stores/vault-store';

export interface ShareDialogProps {
  open: boolean;
  itemId: string | null;
  itemName?: string;
  onClose: () => void;
  onShared?: () => void;
  className?: string;
}

export function ShareDialog({
  open,
  itemId,
  itemName,
  onClose,
  onShared,
  className,
}: ShareDialogProps): JSX.Element | null {
  const client = useVaultStore((s) => s.client);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !itemId) return null;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!client) return;
    setError(null);
    setBusy(true);
    try {
      await client.share({ itemId, recipientEmail: email, permission });
      setEmail('');
      onShared?.();
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
      aria-label="Share item"
      data-testid="share-dialog"
      className={className}
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
        style={{
          background: 'white',
          padding: 24,
          borderRadius: 8,
          minWidth: 320,
          maxWidth: 480,
          display: 'grid',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Share &quot;{itemName ?? 'item'}&quot;</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
          The recipient must already have a 123Pass account on this device.
        </p>
        <label>
          Recipient email
          <input
            aria-label="recipient-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <fieldset style={{ border: 'none', padding: 0 }}>
          <legend>Permission</legend>
          <label>
            <input
              type="radio"
              name="permission"
              value="read"
              checked={permission === 'read'}
              onChange={() => setPermission('read')}
            />
            Read only
          </label>
          <label>
            <input
              type="radio"
              name="permission"
              value="write"
              checked={permission === 'write'}
              onChange={() => setPermission('write')}
            />
            Read &amp; write
          </label>
        </fieldset>
        {error ? (
          <div role="alert" data-testid="share-error" style={{ color: 'crimson' }}>
            {error}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !email}>
            {busy ? 'Sharing…' : 'Share'}
          </button>
        </div>
      </form>
    </div>
  );
}
