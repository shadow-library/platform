import { createCipheriv, createDecipheriv } from 'node:crypto';

import { CryptoErrorCode } from './crypto.errors';

export interface SealedBytes {
  ciphertext: Buffer;
  tag: Buffer;
}

export const ENVELOPE_VERSION = 1;
export const ENVELOPE_ALGORITHM = 'A256GCM';

export const KEY_LENGTH = 32;
export const IV_LENGTH = 12;
/** Pinned so `setAuthTag` cannot accept a truncated tag: node otherwise allows any GCM-permitted length, and a 4-byte tag is forgeable. */
export const TAG_LENGTH = 16;

const CIPHER = 'aes-256-gcm';
const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** `Buffer.from(value, 'base64url')` skips invalid characters and ignores trailing bits, so only a canonical round trip proves the text is what it claims. */
export function decodeBase64Url(value: string, length?: number): Buffer | null {
  if (!BASE64URL.test(value)) return null;
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) return null;
  if (length !== undefined && bytes.length !== length) return null;
  return bytes;
}

export function gcmEncrypt(key: Buffer, iv: Buffer, plaintext: Buffer, aad: string): SealedBytes {
  const cipher = createCipheriv(CIPHER, key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, tag: cipher.getAuthTag() };
}

export function gcmDecrypt(key: Buffer, iv: Buffer, sealed: SealedBytes, aad: string): Buffer {
  let unverified: Buffer | undefined;
  try {
    const decipher = createDecipheriv(CIPHER, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(sealed.tag);
    unverified = decipher.update(sealed.ciphertext);
    return Buffer.concat([unverified, decipher.final()]);
  } catch {
    return CryptoErrorCode.DECRYPTION_FAILED.throw();
  } finally {
    unverified?.fill(0);
  }
}
