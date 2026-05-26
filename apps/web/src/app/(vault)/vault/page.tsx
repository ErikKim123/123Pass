'use client';

import { useMemo, useState } from 'react';

import {
  ShareDialog,
  useAutoRefresh,
  useFilteredItems,
  useVaultStore,
  VaultItemDetail,
  VaultItemList,
  VaultSidebar,
  type SidebarFilter,
} from '@123pass/ui';

import { NewItemDialog } from '@/components/NewItemDialog';

export default function VaultPage(): JSX.Element {
  const client = useVaultStore((s) => s.client);
  const selectedId = useVaultStore((s) => s.selectedItemId);
  const select = useVaultStore((s) => s.select);
  const query = useVaultStore((s) => s.query);
  const setQuery = useVaultStore((s) => s.setQuery);
  const refresh = useVaultStore((s) => s.refresh);

  const [filter, setFilter] = useState<SidebarFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useAutoRefresh();
  const items = useFilteredItems();

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'favorites') return items.filter((i) => i.favorite);
    if (filter === 'shared' || filter === 'trash') return [];
    return items.filter((i) => i.itemType === filter);
  }, [items, filter]);

  const counts = useMemo(
    () => ({
      all: items.length,
      favorites: items.filter((i) => i.favorite).length,
      login: items.filter((i) => i.itemType === 'login').length,
      note: items.filter((i) => i.itemType === 'note').length,
      card: items.filter((i) => i.itemType === 'card').length,
      totp: items.filter((i) => i.itemType === 'totp').length,
    }),
    [items],
  );

  const selected = filtered.find((i) => i.id === selectedId) ?? null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr 1fr',
        gap: 16,
        height: 'calc(100vh - 100px)',
      }}
    >
      <VaultSidebar selected={filter} counts={counts} onSelect={setFilter} />

      <section>
        <header style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            aria-label="search"
            placeholder="Search vault…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" onClick={() => setDialogOpen(true)}>
            + New
          </button>
        </header>
        <VaultItemList items={filtered} selectedId={selectedId} onSelect={select} />
      </section>

      <div>
        <VaultItemDetail
          item={selected}
          onDelete={async () => {
            if (!selected || !client) return;
            await client.delete(selected.id);
            select(null);
            await refresh();
          }}
        />
        {selected ? (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            style={{ marginTop: 8 }}
            data-testid="open-share-dialog"
          >
            Share with another user
          </button>
        ) : null}
      </div>

      <ShareDialog
        open={shareOpen}
        itemId={selected?.id ?? null}
        itemName={selected?.payload.name}
        onClose={() => setShareOpen(false)}
      />

      <NewItemDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}
