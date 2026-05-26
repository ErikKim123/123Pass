import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Button, Pressable, StyleSheet, Text, View } from 'react-native';

import { CLIPBOARD_CLEAR_MS } from '@123pass/shared';
import type { DecryptedItem } from '@123pass/vault-sdk';

import { useVaultStore } from '@/lib/vault-store';

export default function VaultItemDetailScreen(): JSX.Element {
  const params = useLocalSearchParams<{ id: string }>();
  const client = useVaultStore((s) => s.client);
  const refresh = useVaultStore((s) => s.refresh);
  const router = useRouter();
  const [item, setItem] = useState<DecryptedItem | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !params.id) return;
    void client.read(params.id).then(setItem).catch((e: Error) => {
      Alert.alert('Error', e.message);
      router.back();
    });
  }, [client, params.id, router]);

  const copy = async (value: string | undefined, field: string): Promise<void> => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopiedField(field);
    setTimeout(() => {
      void Clipboard.setStringAsync('');
      setCopiedField(null);
    }, CLIPBOARD_CLEAR_MS);
  };

  const remove = async (): Promise<void> => {
    if (!client || !item) return;
    Alert.alert('Delete item', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await client.delete(item.id);
          await refresh();
          router.back();
        },
      },
    ]);
  };

  if (!item) return <View style={styles.container}><Text>Loading…</Text></View>;

  const masked = item.payload.password
    ? showPassword
      ? item.payload.password
      : '•'.repeat(Math.min(item.payload.password.length, 12))
    : '';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{item.payload.name}</Text>
      {item.payload.url ? <Text style={styles.url}>{item.payload.url}</Text> : null}

      {item.payload.username ? (
        <View style={styles.field}>
          <Text style={styles.label}>Username</Text>
          <Text style={styles.value}>{item.payload.username}</Text>
          <Pressable onPress={() => void copy(item.payload.username, 'username')}>
            <Text style={styles.copyText}>
              {copiedField === 'username' ? 'Copied!' : 'Copy'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {item.payload.password ? (
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <Text style={styles.value}>{masked}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={() => setShowPassword((v) => !v)}>
              <Text style={styles.copyText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
            <Pressable onPress={() => void copy(item.payload.password, 'password')}>
              <Text style={styles.copyText}>
                {copiedField === 'password' ? 'Copied!' : 'Copy'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {item.payload.notes ? (
        <View style={styles.field}>
          <Text style={styles.label}>Notes</Text>
          <Text style={styles.notes}>{item.payload.notes}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: 24 }}>
        <Button title="Delete" color="crimson" onPress={() => void remove()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '600' },
  url: { color: '#666' },
  field: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  label: { fontSize: 12, color: '#888', marginBottom: 4 },
  value: { fontSize: 16 },
  notes: { fontSize: 14, fontFamily: 'monospace' },
  copyText: { color: '#4f46e5', marginTop: 4 },
});
