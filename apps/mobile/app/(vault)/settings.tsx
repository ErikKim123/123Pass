import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EXPORT_FORMAT_ID } from '@123pass/shared';
import type { ExportableItem } from '@123pass/vault-sdk';

import {
  disableBiometricUnlock,
  enableBiometricUnlock,
  isBiometricSupported,
} from '@/lib/biometric';
import { useVaultStore } from '@/lib/vault-store';

interface ImportSummary {
  imported: number;
  failed: number;
  failures: Array<{ name: string; reason: string }>;
}

function formatImportSummary(result: ImportSummary, source: string): string {
  const head = `Imported ${result.imported} from ${source} (${result.failed} failed).`;
  if (result.failures.length === 0) return head;
  const names = result.failures
    .slice(0, 3)
    .map((f) => f.name)
    .join(', ');
  const rest = result.failures.length > 3 ? ` +${result.failures.length - 3}` : '';
  return `${head} Failed: ${names}${rest}`;
}

export default function SettingsScreen(): JSX.Element {
  const client = useVaultStore((s) => s.client);
  const lock = useVaultStore((s) => s.lock);
  const router = useRouter();
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  // FR-15 — export/import (clipboard-based to avoid expo-document-picker dep)
  const [exportPw, setExportPw] = useState('');
  const [exporting, setExporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPw, setImportPw] = useState('');
  const [importing, setImporting] = useState(false);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [pendingEncryptedFile, setPendingEncryptedFile] = useState<unknown | null>(null);

  useEffect(() => {
    void isBiometricSupported().then(setBiometricSupported);
  }, []);

  const toggleBiometric = async (value: boolean): Promise<void> => {
    if (!client) return;
    try {
      if (value) {
        await enableBiometricUnlock(client.currentSession().vaultKey);
      } else {
        await disableBiometricUnlock();
      }
      setBiometricEnabled(value);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  };

  const lockNow = (): void => {
    lock();
    router.replace('/(auth)/login');
  };

  const handleExport = async (): Promise<void> => {
    if (!client) return;
    if (exportPw.length < 12) {
      Alert.alert('Export', 'Export password must be at least 12 characters');
      return;
    }
    setExporting(true);
    try {
      const file = await client.exportVault(exportPw);
      await Clipboard.setStringAsync(JSON.stringify(file));
      Alert.alert(
        'Export',
        'Encrypted vault copied to clipboard. Paste it into a secure note or storage app.',
      );
      setExportPw('');
    } catch (e) {
      Alert.alert('Export', (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handlePasteAndImport = async (): Promise<void> => {
    if (!client) return;
    setImportInfo(null);
    setPendingEncryptedFile(null);
    let text = importText;
    if (!text) {
      try {
        text = await Clipboard.getStringAsync();
      } catch {
        // fall through
      }
    }
    if (!text) {
      Alert.alert('Import', 'Paste an export string or copy one to the clipboard first.');
      return;
    }
    setImporting(true);
    try {
      const trimmed = text.trimStart();
      const isEncryptedExport =
        trimmed.startsWith('{') &&
        (() => {
          try {
            return (JSON.parse(trimmed) as { format?: unknown }).format === EXPORT_FORMAT_ID;
          } catch {
            return false;
          }
        })();
      if (isEncryptedExport) {
        setPendingEncryptedFile(JSON.parse(trimmed));
        setImportInfo('Encrypted export detected — enter password and tap Decrypt.');
        return;
      }
      const items: ExportableItem[] = client.parseImport(text);
      const result = await client.importItems(items);
      setImportInfo(formatImportSummary(result, 'pasted text'));
      setImportText('');
    } catch (e) {
      Alert.alert('Import', (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleDecryptImport = async (): Promise<void> => {
    if (!client || !pendingEncryptedFile || !importPw) return;
    setImporting(true);
    try {
      const items = client.decryptExport(pendingEncryptedFile, importPw);
      const result = await client.importItems(items);
      setImportInfo(formatImportSummary(result, 'encrypted export'));
      setPendingEncryptedFile(null);
      setImportPw('');
      setImportText('');
    } catch (e) {
      Alert.alert('Import', (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {biometricSupported ? (
        <View style={styles.row}>
          <Text style={styles.label}>Biometric unlock</Text>
          <Switch value={biometricEnabled} onValueChange={(v) => void toggleBiometric(v)} />
        </View>
      ) : (
        <Text style={styles.helper}>Biometrics not supported on this device.</Text>
      )}

      <View style={styles.section}>
        <Text style={styles.h2}>Export vault</Text>
        <Text style={styles.helper}>
          Re-encrypts items under an export password (≥12 chars) and copies the encrypted JSON to
          the clipboard. Save it to a secure note app.
        </Text>
        <TextInput
          accessibilityLabel="export-password"
          secureTextEntry
          placeholder="Export password"
          value={exportPw}
          onChangeText={setExportPw}
          style={styles.input}
        />
        <Button
          title={exporting ? 'Exporting…' : 'Export to clipboard'}
          disabled={exporting || exportPw.length < 12}
          onPress={() => void handleExport()}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>Import vault</Text>
        <Text style={styles.helper}>
          Paste a 123Pass encrypted JSON, Bitwarden JSON, or 1Password CSV — or leave blank to use
          the clipboard.
        </Text>
        <TextInput
          accessibilityLabel="import-text"
          multiline
          placeholder="Paste export content here…"
          value={importText}
          onChangeText={setImportText}
          style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
        />
        <Button
          title={importing ? 'Working…' : 'Import'}
          disabled={importing}
          onPress={() => void handlePasteAndImport()}
        />
        {pendingEncryptedFile ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            <TextInput
              accessibilityLabel="import-password"
              secureTextEntry
              placeholder="Export password"
              value={importPw}
              onChangeText={setImportPw}
              style={styles.input}
            />
            <Button
              title={importing ? 'Decrypting…' : 'Decrypt and import'}
              disabled={importing || !importPw}
              onPress={() => void handleDecryptImport()}
            />
          </View>
        ) : null}
        {importInfo ? <Text style={styles.info}>{importInfo}</Text> : null}
      </View>

      <View style={{ marginTop: 24 }}>
        <Button title="Lock vault" onPress={lockNow} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  title: { fontSize: 22, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 16 },
  helper: { color: '#666', fontSize: 13 },
  section: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  h2: { fontSize: 18, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
  },
  info: { fontSize: 13, color: '#333' },
});
