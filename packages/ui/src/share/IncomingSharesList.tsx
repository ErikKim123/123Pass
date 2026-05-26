// Lists shares received by the current user. Each row can be accepted (decrypts + copies into vault)
// or dismissed (server row deleted).

import { useEffect, useState } from 'react';

import type { SharedItemsRow } from '@123pass/vault-sdk';
import { openSharedItem } from '@123pass/vault-sdk';

import { useVaultStore } from '../stores/vault-store';

export interface IncomingSharesListProps {
  className?: string;
  onAccepted?: () => void;
}

export function IncomingSharesList({
  className,
  onAccepted,
}: IncomingSharesListProps): JSX.Element {
  const client = useVaultStore((s) => s.client);
  const [shares, setShares] = useState<SharedItemsRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    void client.repo.listIncomingShares().then(setShares);
  }, [client]);

  const accept = async (share: SharedItemsRow): Promise<void> => {
    if (!client) return;
    setError(null);
    setBusyId(share.id);
    try {
      await openSharedItem({
        repo: client.repo,
        session: client.currentSession(),
        shareId: share.id,
        itemId: share.item_id,
        wrappedKey: share.wrapped_key,
      });
      // Remove from local list after acceptance.
      setShares((prev) => prev.filter((s) => s.id !== share.id));
      onAccepted?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (share: SharedItemsRow): Promise<void> => {
    if (!client) return;
    setBusyId(share.id);
    try {
      await client.repo.deleteShare(share.id);
      setShares((prev) => prev.filter((s) => s.id !== share.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={className} data-testid="incoming-shares">
      <h2>Incoming shares ({shares.length})</h2>
      {error ? (
        <div role="alert" data-testid="incoming-shares-error">
          {error}
        </div>
      ) : null}
      {shares.length === 0 ? (
        <p data-testid="no-incoming-shares">No pending shares.</p>
      ) : (
        <ul>
          {shares.map((share) => (
            <li key={share.id} data-testid={`share-row-${share.id}`}>
              <div>
                From: <code>{share.from_user_id.slice(0, 12)}…</code>
              </div>
              <div>Permission: {share.permission}</div>
              <div>
                <button
                  type="button"
                  disabled={busyId === share.id}
                  onClick={() => void accept(share)}
                >
                  {busyId === share.id ? 'Accepting…' : 'Accept'}
                </button>
                <button
                  type="button"
                  disabled={busyId === share.id}
                  onClick={() => void dismiss(share)}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
