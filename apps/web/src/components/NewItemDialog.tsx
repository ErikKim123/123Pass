'use client';

import { useState, type FormEvent } from 'react';

import type { VaultItemPayload, VaultItemType } from '@123pass/shared';
import { PasswordGenerator, useVaultStore } from '@123pass/ui';

export interface NewItemDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function NewItemDialog({ open, onClose, onSaved }: NewItemDialogProps): JSX.Element | null {
  const client = useVaultStore((s) => s.client);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [itemType, setItemType] = useState<VaultItemType>('login');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!client) return;
    const payload: VaultItemPayload = {
      name,
      url: url || undefined,
      username: username || undefined,
      password: password || undefined,
      notes: notes || undefined,
    };
    setSaving(true);
    try {
      await client.create(payload, itemType);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="New vault item"
      data-testid="new-item-dialog"
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
          minWidth: 400,
          maxWidth: 600,
          display: 'grid',
          gap: 8,
        }}
      >
        <h2>New item</h2>
        <label>
          Type
          <select
            aria-label="item-type"
            value={itemType}
            onChange={(e) => setItemType(e.target.value as VaultItemType)}
          >
            <option value="login">Login</option>
            <option value="note">Note</option>
            <option value="card">Card</option>
            <option value="identity">Identity</option>
            <option value="totp">TOTP</option>
          </select>
        </label>
        <label>
          Name
          <input
            aria-label="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          URL
          <input aria-label="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Username
          <input
            aria-label="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            aria-label="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <details>
          <summary>Generate strong password</summary>
          <PasswordGenerator onChange={(pw) => setPassword(pw)} />
        </details>
        <label>
          Notes
          <textarea
            aria-label="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </label>
        {error ? <div role="alert">{error}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !name}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
