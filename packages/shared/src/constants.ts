// Design Ref: §7.3 — cryptographic parameters chosen per OWASP ASVS V6 Level 2.
// Plan SC: key derivation < 500ms on mobile devices.

export const ARGON2_MEMORY_COST = 65536; // 64 MiB
export const ARGON2_TIME_COST = 3;
export const ARGON2_PARALLELISM = 4;
export const ARGON2_OUTPUT_LENGTH = 32; // 256-bit derived key

export const AES_GCM_IV_LENGTH = 12; // 96 bits — NIST recommendation
export const AES_GCM_TAG_LENGTH = 16; // 128 bits
export const AES_KEY_LENGTH = 32; // 256 bits

export const SALT_LENGTH = 16; // 128 bits
export const HKDF_INFO_SEARCH = 'search-key-v1';
export const HKDF_INFO_WRAP = 'wrap-key-v1';

export const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes inactivity
export const CLIPBOARD_CLEAR_MS = 30 * 1000; // 30 seconds default

export const RECOVERY_WORD_COUNT = 24; // BIP39 24-word seed
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;

export const KDF_VERSION = 'argon2id-v1';
export const AEAD_VERSION = 'aes-256-gcm-v1';
