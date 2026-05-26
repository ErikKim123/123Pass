// Design Ref: §5.4 — vault item list.

import type { DecryptedItem } from '@123pass/vault-sdk';

export interface VaultItemListProps {
  items: DecryptedItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

export function VaultItemList({
  items,
  selectedId,
  onSelect,
  className,
}: VaultItemListProps): JSX.Element {
  if (items.length === 0) {
    return (
      <div className={className} data-testid="vault-list-empty">
        No items
      </div>
    );
  }
  return (
    <ul className={className} data-testid="vault-list" role="list">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-pressed={item.id === selectedId}
            data-selected={item.id === selectedId}
            data-id={item.id}
            onClick={() => onSelect(item.id)}
          >
            <span data-testid={`item-name-${item.id}`}>{item.payload.name}</span>
            <span data-testid={`item-user-${item.id}`}>{item.payload.username ?? ''}</span>
            {item.favorite ? <span aria-label="favorite">★</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
