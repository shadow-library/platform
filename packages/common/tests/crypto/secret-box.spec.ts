import { describe, expect, it } from 'bun:test';

import { ErrorCode } from '@lib/errors';
import { CryptoErrorCode, type Envelope, type Keyring, parseKeyring, SecretBox, type WrappedKey } from '@lib/crypto';
import { LocalKeyring } from '@lib/crypto/local-keyring';

import { CONTEXT, flipFirstByte, KAT_DATA_IV_BYTE, KAT_DEK, KAT_ENVELOPE, KAT_MASTER_KEY, KAT_PLAINTEXT, KAT_WRAP_IV_BYTE, KEY_ONE, KEY_TWO, rejectionOf } from './crypto.fixtures';

class FixedLocalKeyring extends LocalKeyring {
  protected override randomBytes(size: number): Buffer {
    return Buffer.alloc(size, KAT_WRAP_IV_BYTE);
  }
}

class FixedSecretBox extends SecretBox {
  readonly issuedKeys: Buffer[] = [];

  protected override randomBytes(size: number): Buffer {
    if (size !== KAT_DEK.length) return Buffer.alloc(size, KAT_DATA_IV_BYTE);
    const dek = Buffer.from(KAT_DEK);
    this.issuedKeys.push(dek);
    return dek;
  }
}

class RecordingKeyring implements Keyring {
  readonly unwrapped: Buffer[] = [];

  constructor(private readonly inner: Keyring) {}

  get activeKeyId(): string {
    return this.inner.activeKeyId;
  }

  has(kid: string): boolean {
    return this.inner.has(kid);
  }

  wrap(dek: Buffer, context: string): Promise<WrappedKey> {
    return this.inner.wrap(dek, context);
  }

  async unwrap(kid: string, wrapped: Buffer, context: string): Promise<Buffer> {
    const dek = await this.inner.unwrap(kid, wrapped, context);
    this.unwrapped.push(dek);
    return dek;
  }
}

const katKeyring = (): FixedLocalKeyring => new FixedLocalKeyring([{ kid: 'k1', key: KAT_MASTER_KEY }]);
const oldBox = new SecretBox(parseKeyring(`k1:${KEY_ONE}`));
const rotatedBox = new SecretBox(parseKeyring(`k2:${KEY_TWO},k1:${KEY_ONE}`));
const newOnlyBox = new SecretBox(parseKeyring(`k2:${KEY_TWO}`));

describe('SecretBox', () => {
  describe('seal and open', () => {
    it('should round-trip a string plaintext', async () => {
      const envelope = await oldBox.seal('sk-or-secret', CONTEXT);
      expect((await oldBox.open(envelope, CONTEXT)).toString('utf8')).toBe('sk-or-secret');
    });

    it('should round-trip a buffer plaintext without consuming it', async () => {
      const plaintext = Buffer.from([0, 1, 2, 255]);
      const envelope = await oldBox.seal(plaintext, CONTEXT);
      expect(plaintext).toEqual(Buffer.from([0, 1, 2, 255]));
      expect(await oldBox.open(envelope, CONTEXT)).toEqual(plaintext);
    });

    it('should round-trip an empty plaintext', async () => {
      const envelope = await oldBox.seal('', CONTEXT);
      expect(envelope.ct).toBe('');
      expect((await oldBox.open(envelope, CONTEXT)).length).toBe(0);
    });

    it('should use a fresh data key and iv for every seal', async () => {
      const [first, second] = await Promise.all([oldBox.seal('same', CONTEXT), oldBox.seal('same', CONTEXT)]);
      expect(first.dek).not.toBe(second.dek);
      expect(first.iv).not.toBe(second.iv);
      expect(first.ct).not.toBe(second.ct);
    });

    it('should seal the known-answer vector from a fixed data key and iv', async () => {
      const envelope = await new FixedSecretBox(katKeyring()).seal(KAT_PLAINTEXT, CONTEXT);
      expect(envelope).toEqual({ ...KAT_ENVELOPE });
    });

    it('should open the stored known-answer vector', async () => {
      const box = new SecretBox(parseKeyring(`k1:${KAT_MASTER_KEY.toString('base64url')}`));
      expect((await box.open({ ...KAT_ENVELOPE }, CONTEXT)).toString('utf8')).toBe(KAT_PLAINTEXT);
    });

    it('should zero the data key once sealed and once opened', async () => {
      const recording = new RecordingKeyring(katKeyring());
      const box = new FixedSecretBox(recording);
      const envelope = await box.seal(KAT_PLAINTEXT, CONTEXT);
      await box.open(envelope, CONTEXT);
      expect([...box.issuedKeys, ...recording.unwrapped].every(dek => dek.every(byte => byte === 0))).toBe(true);
      expect(recording.unwrapped.length).toBe(1);
    });

    it('should reject an empty context', async () => {
      const error = await rejectionOf(oldBox.seal('secret', ''));
      expect(error.code).toBe(ErrorCode.INTERNAL.code);
    });
  });

  describe('tampering', () => {
    const sealed = oldBox.seal('sk-or-secret', CONTEXT);

    it.each(['ct', 'tag', 'iv', 'dek'] as const)('should refuse a tampered %s', async field => {
      const envelope = await sealed;
      const error = await rejectionOf(oldBox.open({ ...envelope, [field]: flipFirstByte(envelope[field]) }, CONTEXT));
      expect(error.code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
    });

    it('should refuse a kid swapped to another key in the keyring', async () => {
      const error = await rejectionOf(rotatedBox.open({ ...(await sealed), kid: 'k2' }, CONTEXT));
      expect(error.code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
    });

    it('should refuse a kid the keyring does not hold', async () => {
      const error = await rejectionOf(oldBox.open({ ...(await sealed), kid: 'k9' }, CONTEXT));
      expect(error.code).toBe(CryptoErrorCode.UNKNOWN_KEY.code);
      expect(error.message).toContain("'k9'");
    });

    it('should refuse a dek taken from another envelope of the same context', async () => {
      const [first, second] = await Promise.all([sealed, oldBox.seal('sk-or-other', CONTEXT)]);
      const error = await rejectionOf(oldBox.open({ ...first, dek: second.dek }, CONTEXT));
      expect(error.code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
    });

    it('should refuse a different context', async () => {
      const error = await rejectionOf(oldBox.open(await sealed, CONTEXT.replace(':secret', ':other')));
      expect(error.code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
    });

    it('should refuse a truncated data key', async () => {
      const envelope = await sealed;
      const error = await rejectionOf(oldBox.open({ ...envelope, dek: envelope.dek.slice(0, 40) }, CONTEXT));
      expect(error.code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
    });

    it('should refuse a field that is not canonical base64url', async () => {
      const envelope = await sealed;
      const error = await rejectionOf(oldBox.open({ ...envelope, iv: `${envelope.iv}=` }, CONTEXT));
      expect(error.code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
    });

    it('should refuse an envelope with an unsupported version or algorithm', async () => {
      const envelope = await sealed;
      const versions = await rejectionOf(oldBox.open({ ...envelope, v: 2 } as unknown as Envelope, CONTEXT));
      const algorithms = await rejectionOf(oldBox.open({ ...envelope, alg: 'A128GCM' } as unknown as Envelope, CONTEXT));
      expect([versions.code, algorithms.code]).toEqual([CryptoErrorCode.ENVELOPE_UNSUPPORTED.code, CryptoErrorCode.ENVELOPE_UNSUPPORTED.code]);
    });

    it.each([[null], [{}], [[]], [{ foo: 1 }]])('should refuse %p as undecryptable rather than unsupported', async value => {
      const error = await rejectionOf(oldBox.open(value as unknown as Envelope, CONTEXT));
      expect(error.code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
    });

    it('should refuse a kid that could forge a log line', async () => {
      const error = await rejectionOf(oldBox.open({ ...(await sealed), kid: 'k1\nforged' }, CONTEXT));
      expect(error.code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
    });
  });

  describe('rotation', () => {
    it('should open envelopes sealed under every key in the keyring', async () => {
      const [old, current] = await Promise.all([oldBox.seal('old', CONTEXT), rotatedBox.seal('current', CONTEXT)]);
      expect([old.kid, current.kid]).toEqual(['k1', 'k2']);
      const opened = await Promise.all([rotatedBox.open(old, CONTEXT), rotatedBox.open(current, CONTEXT)]);
      expect(opened.map(bytes => bytes.toString('utf8'))).toEqual(['old', 'current']);
    });

    it('should report a rewrap only for an envelope on a non-active key', async () => {
      const [old, current] = await Promise.all([oldBox.seal('old', CONTEXT), rotatedBox.seal('current', CONTEXT)]);
      expect([rotatedBox.needsRewrap(old), rotatedBox.needsRewrap(current)]).toEqual([true, false]);
    });

    it('should rewrap onto the active key and leave iv, ct and tag byte-identical', async () => {
      const old = await oldBox.seal('sk-or-secret', CONTEXT);
      const rewrapped = await rotatedBox.rewrap(old, CONTEXT);
      expect(rewrapped.kid).toBe('k2');
      expect(rewrapped.dek).not.toBe(old.dek);
      expect({ iv: rewrapped.iv, ct: rewrapped.ct, tag: rewrapped.tag }).toEqual({ iv: old.iv, ct: old.ct, tag: old.tag });
      expect((await newOnlyBox.open(rewrapped, CONTEXT)).toString('utf8')).toBe('sk-or-secret');
    });

    it('should refuse to rewrap an envelope whose ciphertext was tampered with', async () => {
      const old = await oldBox.seal('sk-or-secret', CONTEXT);
      const error = await rejectionOf(rotatedBox.rewrap({ ...old, ct: flipFirstByte(old.ct) }, CONTEXT));
      expect(error.code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
    });

    it('should refuse to rewrap under a different context', async () => {
      const old = await oldBox.seal('sk-or-secret', CONTEXT);
      const error = await rejectionOf(rotatedBox.rewrap(old, `${CONTEXT}x`));
      expect(error.code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
    });
  });
});
