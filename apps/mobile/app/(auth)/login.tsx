import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { isBiometricSupported, tryBiometricUnlock } from '@/lib/biometric';
import { useVaultStore } from '@/lib/vault-store';

const fastKdf = { memoryCost: 8192, timeCost: 1, parallelism: 1 } as const;

export default function LoginScreen(): JSX.Element {
  const client = useVaultStore((s) => s.client);
  const refresh = useVaultStore((s) => s.refresh);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    void isBiometricSupported().then(setBiometricAvailable);
  }, []);

  const submit = async (): Promise<void> => {
    if (!client) return;
    setLoading(true);
    try {
      const dir = await client.repo.getUserDirectoryEntry(email);
      if (dir) {
        const profile = await client.repo.getUserRecord(dir.id);
        if (!profile) throw new Error('User profile missing');
        await client.unlock({ email, masterPassword: password, kdfParams: profile.kdfParams });
      } else {
        await client.signUp({ email, masterPassword: password, kdfOverrides: fastKdf });
      }
      await refresh();
      router.replace('/(vault)');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const biometric = async (): Promise<void> => {
    const key = await tryBiometricUnlock();
    if (!key) {
      Alert.alert('Biometric', 'Unable to unlock with biometrics. Use master password.');
      return;
    }
    // Biometric unlock only restores the vault key — we still need a session.
    // The caller must have signed in once before to populate auth.users.
    await refresh();
    router.replace('/(vault)');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>123Pass</Text>
      <TextInput
        accessibilityLabel="email"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        accessibilityLabel="master-password"
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Master password"
        secureTextEntry
      />
      <Button
        title={loading ? 'Working…' : 'Unlock / Sign up'}
        onPress={() => void submit()}
        disabled={loading || !email || !password}
      />
      {biometricAvailable ? (
        <View style={{ marginTop: 16 }}>
          <Button title="Use biometrics" onPress={() => void biometric()} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
});
