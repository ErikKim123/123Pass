// Wrapper around expo-local-authentication + expo-secure-store.
// If the user opts in, we wrap the vault key under a device-only key and stash it in secure-store.
// Biometric unlock then loads + decrypts the cached vault key without re-deriving from PW.

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import { base64Decode, base64Encode, decrypt, encrypt, getRandomBytes } from '@123pass/core-crypto';

const KEY_BIOMETRIC_BLOB = 'biometric_vault_key_v1';
const KEY_BIOMETRIC_WRAP = 'biometric_wrap_key_v1';

export async function isBiometricSupported(): Promise<boolean> {
  const has = await LocalAuthentication.hasHardwareAsync();
  if (!has) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function enableBiometricUnlock(vaultKey: Uint8Array): Promise<void> {
  // Generate a device-local wrap key, store it in secure-store, and use it to encrypt the vault key.
  const wrapKey = getRandomBytes(32);
  const wrapped = encrypt(wrapKey, vaultKey);

  await SecureStore.setItemAsync(KEY_BIOMETRIC_WRAP, base64Encode(wrapKey), {
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    requireAuthentication: true,
  });
  await SecureStore.setItemAsync(KEY_BIOMETRIC_BLOB, JSON.stringify(wrapped));
}

export async function disableBiometricUnlock(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_BIOMETRIC_BLOB).catch(() => undefined);
  await SecureStore.deleteItemAsync(KEY_BIOMETRIC_WRAP).catch(() => undefined);
}

export async function tryBiometricUnlock(): Promise<Uint8Array | null> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock 123Pass',
    fallbackLabel: 'Use master password',
    disableDeviceFallback: false,
  });
  if (!result.success) return null;

  const wrappedRaw = await SecureStore.getItemAsync(KEY_BIOMETRIC_BLOB);
  const wrapKeyB64 = await SecureStore.getItemAsync(KEY_BIOMETRIC_WRAP);
  if (!wrappedRaw || !wrapKeyB64) return null;
  const wrapped = JSON.parse(wrappedRaw) as { ciphertext: string; iv: string; authTag: string };
  const wrapKey = base64Decode(wrapKeyB64);
  try {
    return decrypt(wrapKey, wrapped);
  } catch {
    return null;
  }
}
