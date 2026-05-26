// Design Ref: §6.3 — crypto failures are explicit, never silent.

export class CryptoError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}

export const ERR_KDF_FAILED = 'CRYPTO_KEY_DERIVATION_FAILED';
export const ERR_DECRYPT_FAILED = 'CRYPTO_DECRYPT_FAILED';
export const ERR_INVALID_KEY_LENGTH = 'CRYPTO_INVALID_KEY_LENGTH';
export const ERR_INVALID_IV_LENGTH = 'CRYPTO_INVALID_IV_LENGTH';
export const ERR_INVALID_INPUT = 'CRYPTO_INVALID_INPUT';
export const ERR_RECOVERY_INVALID = 'RECOVERY_INVALID_SEED';
