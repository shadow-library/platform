import { randomBytes } from 'node:crypto';

import { AppError } from '@lib/errors';

import { CryptoErrorCode } from './crypto.errors';
import { gcmDecrypt, gcmEncrypt, IV_LENGTH, KEY_LENGTH, TAG_LENGTH } from './crypto.utils';
import { type Keyring, type WrappedKey } from './keyring.types';

export interface KeyringEntry {
  kid: string;
  key: Buffer;
}

const WRAPPED_LENGTH = IV_LENGTH + KEY_LENGTH + TAG_LENGTH;

/** Keys sit in a `#private` field so neither `inspect` nor `JSON.stringify` of the keyring can print them. */
export class LocalKeyring implements Keyring {
  readonly activeKeyId: string;
  readonly #keys: ReadonlyMap<string, Buffer>;

  constructor(entries: readonly [KeyringEntry, ...KeyringEntry[]]) {
    this.activeKeyId = entries[0].kid;
    this.#keys = new Map(entries.map(entry => [entry.kid, entry.key]));
  }

  has(kid: string): boolean {
    return this.#keys.has(kid);
  }

  async wrap(dek: Buffer, context: string): Promise<WrappedKey> {
    if (dek.length !== KEY_LENGTH) throw AppError.internal(`A data key must be ${KEY_LENGTH} bytes`);
    const kid = this.activeKeyId;
    const iv = this.randomBytes(IV_LENGTH);
    const { ciphertext, tag } = gcmEncrypt(this.keyFor(kid), iv, dek, wrapAad(kid, context));
    return { kid, wrapped: Buffer.concat([iv, ciphertext, tag]) };
  }

  async unwrap(kid: string, wrapped: Buffer, context: string): Promise<Buffer> {
    const key = this.keyFor(kid);
    if (wrapped.length !== WRAPPED_LENGTH) CryptoErrorCode.DECRYPTION_FAILED.throw();
    const iv = wrapped.subarray(0, IV_LENGTH);
    const ciphertext = wrapped.subarray(IV_LENGTH, IV_LENGTH + KEY_LENGTH);
    const tag = wrapped.subarray(IV_LENGTH + KEY_LENGTH);
    return gcmDecrypt(key, iv, { ciphertext, tag }, wrapAad(kid, context));
  }

  protected randomBytes(size: number): Buffer {
    return randomBytes(size);
  }

  private keyFor(kid: string): Buffer {
    return this.#keys.get(kid) ?? CryptoErrorCode.UNKNOWN_KEY.throw({ kid });
  }
}

function wrapAad(kid: string, context: string): string {
  return `v1-wrap|${kid}|${context}`;
}
