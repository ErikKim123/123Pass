import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useVaultStore } from '@/lib/vault-store';

export default function VaultListScreen(): JSX.Element {
  const items = useVaultStore((s) => s.items);
  const refresh = useVaultStore((s) => s.refresh);
  const lock = useVaultStore((s) => s.lock);
  const router = useRouter();
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const filtered = query.trim()
    ? items.filter((i) => {
        const q = query.trim().toLowerCase();
        return (
          i.payload.name.toLowerCase().includes(q) ||
          (i.payload.username ?? '').toLowerCase().includes(q) ||
          (i.payload.url ?? '').toLowerCase().includes(q)
        );
      })
    : items;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Vault</Text>
        <Pressable
          onPress={() => {
            lock();
            router.replace('/(auth)/login');
          }}
        >
          <Text style={styles.lockText}>Lock</Text>
        </Pressable>
      </View>
      <TextInput
        accessibilityLabel="search"
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Search…"
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No items</Text>}
        renderItem={({ item }) => (
          <Link href={`/(vault)/${item.id}`} asChild>
            <Pressable style={styles.row}>
              <Text style={styles.itemName}>{item.payload.name}</Text>
              {item.payload.username ? (
                <Text style={styles.itemSub}>{item.payload.username}</Text>
              ) : null}
            </Pressable>
          </Link>
        )}
      />
      <Link href="/(vault)/settings" style={{ alignSelf: 'center', marginTop: 12 }}>
        Settings
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  lockText: { color: '#4f46e5', fontSize: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginVertical: 12,
  },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  itemName: { fontSize: 16, fontWeight: '500' },
  itemSub: { fontSize: 13, color: '#666' },
  empty: { textAlign: 'center', color: '#666', marginTop: 32 },
});
