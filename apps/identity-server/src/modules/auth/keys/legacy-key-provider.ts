import { createDecipheriv, createHash } from 'node:crypto';

import { CryptoErrorCode } from '@shadow-library/common/crypto';

export interface LegacySecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/** The three-column format, or the single-column one that holds the same fields as JSON text */
export type StoredLegacySecret = LegacySecret | string;

/** Pinned so `setAuthTag` cannot accept a truncated tag: node otherwise allows any GCM-permitted length, and a 4-byte tag is forgeable. */
const GCM_TAG_LENGTH = 16;

/**
 * Reads the pre-keyring format: AES-256-GCM under `sha256(identity.hmac-key)`, byte for byte the former `security.master-encryption-key` KEK.
 * Kept one release for the backfill and for rows an old image writes during the rollout; it never encrypts.
 */
export class LegacyKeyProvider {
  readonly #kek: Buffer;

  constructor(hmacKey: string) {
    this.#kek = createHash('sha256').update(hmacKey).digest();
  }

  decrypt(stored: StoredLegacySecret): Buffer {
    const secret = typeof stored === 'string' ? parseSerialized(stored) : stored;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.#kek, Buffer.from(secret.iv, 'base64'), { authTagLength: GCM_TAG_LENGTH });
      decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, 'base64')), decipher.final()]);
    } catch {
      return CryptoErrorCode.DECRYPTION_FAILED.throw();
    }
  }
}

export function legacyColumns(ciphertext: string | null, iv: string | null, authTag: string | null): LegacySecret | null {
  if (ciphertext === null || iv === null || authTag === null) return null;
  return { ciphertext, iv, authTag };
}

function parseSerialized(value: string): LegacySecret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return CryptoErrorCode.DECRYPTION_FAILED.throw();
  }
  if (typeof parsed !== 'object' || parsed === null) return CryptoErrorCode.DECRYPTION_FAILED.throw();
  const { ciphertext, iv, authTag } = parsed as Record<string, unknown>;
  if (typeof ciphertext !== 'string' || typeof iv !== 'string' || typeof authTag !== 'string') return CryptoErrorCode.DECRYPTION_FAILED.throw();
  return { ciphertext, iv, authTag };
}
