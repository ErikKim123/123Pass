// Design Ref: §FR-14 — BIP39 24-word seed for master password recovery.
// The seed deterministically derives a recovery vault key; rotating the master
// password issues a new recovery seed because the vault salt changes.

import { sha256 } from '@noble/hashes/sha256';
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

import { RECOVERY_WORD_COUNT } from '@123pass/shared';

import { CryptoError, ERR_RECOVERY_INVALID } from './errors';
import { hkdf } from './hkdf';

const RECOVERY_INFO = 'recovery-vault-key-v1';
const ENTROPY_BITS_PER_WORD = 32 / 3; // BIP39: each word = 11 bits of (entropy+checksum)
// 24-word phrase => 256 bits entropy + 8 bits checksum.

export function generateRecoveryPhrase(): string {
  // BIP39 default strength is 128 bits (12 words). We want 256 bits (24 words).
  return generateMnemonic(wordlist, 256);
}

export function isValidRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(phrase, wordlist);
}

export function deriveRecoveryKey(phrase: string): Uint8Array {
  if (!isValidRecoveryPhrase(phrase)) {
    throw new CryptoError(ERR_RECOVERY_INVALID, 'Recovery phrase failed BIP39 checksum');
  }
  const entropy = mnemonicToEntropy(phrase, wordlist);
  // HKDF-SHA256 binds the recovery key to a domain string.
  return hkdf({ ikm: entropy, info: RECOVERY_INFO, length: 32 });
}

// Exposed for tests — used to validate that wordcount math matches the spec.
export const __recoveryInternals = {
  RECOVERY_INFO,
  ENTROPY_BITS_PER_WORD,
  expectedWordCount: RECOVERY_WORD_COUNT,
  hashHint: (s: string) => sha256(new TextEncoder().encode(s)),
};
