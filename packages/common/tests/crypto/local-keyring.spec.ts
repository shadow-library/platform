import { describe, expect, it } from 'bun:test';

import { ErrorCode } from '@lib/errors';
import { CryptoErrorCode } from '@lib/crypto';
import { LocalKeyring } from '@lib/crypto/local-keyring';

import { CONTEXT, KAT_DEK, KAT_MASTER_KEY, rejectionOf } from './crypto.fixtures';

const keyring = new LocalKeyring([{ kid: 'k1', key: KAT_MASTER_KEY }]);

describe('LocalKeyring', () => {
  it('should wrap a data key into iv, ciphertext and a 16-byte tag', async () => {
    const { kid, wrapped } = await keyring.wrap(KAT_DEK, CONTEXT);
    expect([kid, wrapped.length]).toEqual(['k1', 60]);
    expect(await keyring.unwrap(kid, wrapped, CONTEXT)).toEqual(KAT_DEK);
  });

  it('should refuse to wrap a data key that is not 32 bytes', async () => {
    expect((await rejectionOf(keyring.wrap(Buffer.alloc(16), CONTEXT))).code).toBe(ErrorCode.INTERNAL.code);
  });

  it('should refuse to unwrap under another context', async () => {
    const { wrapped } = await keyring.wrap(KAT_DEK, CONTEXT);
    expect((await rejectionOf(keyring.unwrap('k1', wrapped, `${CONTEXT}x`))).code).toBe(CryptoErrorCode.DECRYPTION_FAILED.code);
  });

  it('should refuse a wrapped key of the wrong length', async () => {
    const { wrapped } = await keyring.wrap(KAT_DEK, CONTEXT);
    const truncated = await rejectionOf(keyring.unwrap('k1', wrapped.subarray(0, 56), CONTEXT));
    const extended = await rejectionOf(keyring.unwrap('k1', Buffer.concat([wrapped, Buffer.alloc(1)]), CONTEXT));
    expect([truncated.code, extended.code]).toEqual([CryptoErrorCode.DECRYPTION_FAILED.code, CryptoErrorCode.DECRYPTION_FAILED.code]);
  });

  it('should refuse an unknown kid', async () => {
    const { wrapped } = await keyring.wrap(KAT_DEK, CONTEXT);
    expect((await rejectionOf(keyring.unwrap('k2', wrapped, CONTEXT))).code).toBe(CryptoErrorCode.UNKNOWN_KEY.code);
  });
});
