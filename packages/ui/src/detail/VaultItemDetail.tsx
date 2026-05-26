// Design Ref: §5.4 / §7.2 — detail pane with auto-clearing clipboard copy.

import { useState } from 'react';

import { CLIPBOARD_CLEAR_MS } from '@123pass/shared';
import type { DecryptedItem } from '@123pass/vault-sdk';

import { TotpDisplay } from '../totp/TotpDisplay';

export interface VaultItemDetailProps {
  item: DecryptedItem | null;
  onEdit?: () => void;
  onDelete?: () => void;
  copyToClipboard?: (text: string) => Promise<void>; // defaults to navigator.clipboard
  className?: string;
}

async function defaultCopy(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}

export function VaultItemDetail({
  item,
  onEdit,
  onDelete,
  copyToClipboard = defaultCopy,
  className,
}: VaultItemDetailProps): JSX.Element {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!item) {
    return (
      <div className={className} data-testid="detail-empty">
        Select an item to view
      </div>
    );
  }

  const copy = async (value: string | undefined, field: string): Promise<void> => {
    if (!value) return;
    await copyToClipboard(value);
    setCopiedField(field);
    setTimeout(async () => {
      await copyToClipboard('');
      setCopiedField(null);
    }, CLIPBOARD_CLEAR_MS);
  };

  const payload = item.payload;

  return (
    <article className={className} data-testid="item-detail" data-id={item.id}>
      <header>
        <h2 data-testid="detail-name">{payload.name}</h2>
        {payload.url ? <a href={payload.url} target="_blank" rel="noreferrer">{payload.url}</a> : null}
      </header>

      {payload.username ? (
        <div>
          <span>Username</span>
          <span data-testid="detail-username">{payload.username}</span>
          <button type="button" onClick={() => void copy(payload.username, 'username')}>
            {copiedField === 'username' ? 'Copied!' : 'Copy'}
          </button>
        </div>
      ) : null}

      {payload.password ? (
        <div>
          <span>Password</span>
          <span data-testid="detail-password">
            {showPassword ? payload.password : '•'.repeat(Math.min(payload.password.length, 12))}
          </span>
          <button type="button" onClick={() => setShowPassword((v) => !v)}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
          <button type="button" onClick={() => void copy(payload.password, 'password')}>
            {copiedField === 'password' ? 'Copied!' : 'Copy'}
          </button>
        </div>
      ) : null}

      {payload.totpSecret ? (
        <div>
          <span>TOTP</span>
          <TotpDisplay secret={payload.totpSecret} />
        </div>
      ) : null}

      {payload.notes ? <pre data-testid="detail-notes">{payload.notes}</pre> : null}

      <footer>
        <button type="button" onClick={onEdit}>Edit</button>
        <button type="button" onClick={onDelete}>Delete</button>
      </footer>
    </article>
  );
}
