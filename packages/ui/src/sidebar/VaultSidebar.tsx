// Design Ref: §5.4 — sidebar categories.

import type { VaultItemType } from '@123pass/shared';

export type SidebarFilter =
  | 'all'
  | 'favorites'
  | VaultItemType
  | 'shared'
  | 'trash';

export interface VaultSidebarProps {
  selected: SidebarFilter;
  counts: Partial<Record<SidebarFilter, number>>;
  onSelect: (filter: SidebarFilter) => void;
  className?: string;
}

const ITEMS: { key: SidebarFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'login', label: 'Logins' },
  { key: 'note', label: 'Notes' },
  { key: 'card', label: 'Cards' },
  { key: 'totp', label: 'TOTP' },
  { key: 'shared', label: 'Shared' },
  { key: 'trash', label: 'Trash' },
];

export function VaultSidebar({
  selected,
  counts,
  onSelect,
  className,
}: VaultSidebarProps): JSX.Element {
  return (
    <nav className={className} data-testid="vault-sidebar" aria-label="Vault categories">
      <ul>
        {ITEMS.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              aria-pressed={selected === item.key}
              data-active={selected === item.key}
              data-filter={item.key}
              onClick={() => onSelect(item.key)}
            >
              <span>{item.label}</span>
              {counts[item.key] != null ? (
                <span data-testid={`count-${item.key}`}>{counts[item.key]}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
