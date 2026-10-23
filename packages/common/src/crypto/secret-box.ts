import { randomBytes } from 'node:crypto';

import { AppError } from '@lib/errors';

import { CryptoErrorCode } from './crypto.errors';
import { decodeBase64Url, ENVELOPE_ALGORITHM, ENVELOPE_VERSION, gcmDecrypt, gcmEncrypt, IV_LENGTH, KEY_LENGTH, TAG_LENGTH } from './crypto.utils';
import { type Envelope, isEnvelope } from './envelope';
import { type Keyring } from './keyring.types';

interface DecodedEnvelope {
  wrapped: Buffer;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

/** `context` is bound as AAD at both layers, so it must name a stable row identity known before insert, e.g. `synapse:provider_credentials:<id>:secret`. */
export class SecretBox {
  constructor(private readonly keyring: Keyring) {}

  async seal(plaintext: Buffer | string, context: string): Promise<Envelope> {
    assertContext(context);
    const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    const dek = this.randomBytes(KEY_LENGTH);
    try {
      const iv = this.randomBytes(IV_LENGTH);
      const { ciphertext, tag } = gcmEncrypt(dek, iv, data, dataAad(context));
      const { kid, wrapped } = await this.keyring.wrap(dek, context);
      return { v: ENVELOPE_VERSION, alg: ENVELOPE_ALGORITHM, kid, dek: encode(wrapped), iv: encode(iv), ct: encode(ciphertext), tag: encode(tag) };
    } finally {
      dek.fill(0);
      if (data !== plaintext) data.fill(0);
    }
  }

  async open(envelope: Envelope, context: string): Promise<Buffer> {
    assertContext(context);
    const decoded = this.decode(envelope);
    const dek = await this.keyring.unwrap(envelope.kid, decoded.wrapped, context);
    try {
      return gcmDecrypt(dek, decoded.iv, decoded, dataAad(context));
    } finally {
      dek.fill(0);
    }
  }

  needsRewrap(envelope: Envelope): boolean {
    return envelope.kid !== this.keyring.activeKeyId;
  }

  /** The data layer is verified first, so a tampered envelope is never re-wrapped. */
  async rewrap(envelope: Envelope, context: string): Promise<Envelope> {
    assertContext(context);
    const decoded = this.decode(envelope);
    const dek = await this.keyring.unwrap(envelope.kid, decoded.wrapped, context);
    try {
      gcmDecrypt(dek, decoded.iv, decoded, dataAad(context)).fill(0);
      const { kid, wrapped } = await this.keyring.wrap(dek, context);
      return { ...envelope, kid, dek: encode(wrapped) };
    } finally {
      dek.fill(0);
    }
  }

  protected randomBytes(size: number): Buffer {
    return randomBytes(size);
  }

  private decode(envelope: Envelope): DecodedEnvelope {
    if (isUnsupported(envelope)) return CryptoErrorCode.ENVELOPE_UNSUPPORTED.throw();
    if (!isEnvelope(envelope)) return CryptoErrorCode.DECRYPTION_FAILED.throw();
    if (!this.keyring.has(envelope.kid)) return CryptoErrorCode.UNKNOWN_KEY.throw({ kid: envelope.kid });
    return {
      wrapped: decodeBase64Url(envelope.dek) as Buffer,
      iv: decodeBase64Url(envelope.iv, IV_LENGTH) as Buffer,
      ciphertext: decodeBase64Url(envelope.ct) as Buffer,
      tag: decodeBase64Url(envelope.tag, TAG_LENGTH) as Buffer,
    };
  }
}

function isUnsupported(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { v, alg } = value as Partial<Record<keyof Envelope, unknown>>;
  return (v !== undefined && v !== ENVELOPE_VERSION) || (alg !== undefined && alg !== ENVELOPE_ALGORITHM);
}

function assertContext(context: string): void {
  if (typeof context !== 'string' || context.length === 0) throw AppError.internal('A secret-box context must be a non-empty string');
}

function dataAad(context: string): string {
  return `v1|${context}`;
}

function encode(bytes: Buffer): string {
  return bytes.toString('base64url');
}
