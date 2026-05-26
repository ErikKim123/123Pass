import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Switch, Text, View } from 'react-native';

import {
  disableBiometricUnlock,
  enableBiometricUnlock,
  isBiometricSupported,
} from '@/lib/biometric';
import { useVaultStore } from '@/lib/vault-store';

export default function SettingsScreen(): JSX.Element {
  const client = useVaultStore((s) => s.client);
  const lock = useVaultStore((s) => s.lock);
  const router = useRouter();
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {biometricSupported ? (
        <View style={styles.row}>
          <Text style={styles.label}>Biometric unlock</Text>
          <Switch value={biometricEnabled} onValueChange={(v) => void toggleBiometric(v)} />
        </View>
      ) : (
        <Text style={styles.helper}>Biometrics not supported on this device.</Text>
      )}

      <View style={{ marginTop: 24 }}>
        <Button title="Lock vault" onPress={lockNow} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  title: { fontSize: 22, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 16 },
  helper: { color: '#666' },
});
