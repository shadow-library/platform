import { createPrivateKey, createPublicKey } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { KeyService } from '@server/modules/auth/keys/key.service';
import { type SigningKey } from '@server/modules/infrastructure/datastore';

import { LEGACY_SIGNING_KEY, sealerFor, SIGNING_KEY_DER_HEX } from './keys.fixtures';

const LEGACY_KID = '11111111-1111-4111-8111-111111111111';

let restoreLogger: RestoreLogger;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

function serviceOver(rows: Partial<SigningKey>[]): KeyService {
  const postgres = {
    insert: () => ({
      values: (row: Partial<SigningKey>) => (rows.push({ status: 'PENDING', privateKeyCiphertext: null, privateKeyIv: null, privateKeyAuthTag: null, ...row }), Promise.resolve()),
    }),
    select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
  };
  return new KeyService(new FakeDatabaseService({ postgres }), sealerFor());
}

describe('KeyService', () => {
  it('should sign with a key it sealed and reloaded, and verify the token', async () => {
    const rows: Partial<SigningKey>[] = [];
    const service = serviceOver(rows);

    const kid = await service.generateKey('ACTIVE');
    await service.reload();
    const { token } = service.sign({ sub: 'user-1' });

    expect({ sealed: rows[0]?.privateKeyEnvelope?.kid, legacy: rows[0]?.privateKeyCiphertext, active: service.getActiveKid() }).toEqual({
      sealed: 'k1',
      legacy: null,
      active: kid,
    });
    expect(service.verify(token)).toEqual({ sub: 'user-1' });
  });

  it('should load a key the previous image wrote in the legacy columns', async () => {
    const der = Buffer.from(SIGNING_KEY_DER_HEX, 'hex');
    const publicJwk = createPublicKey(createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })).export({ format: 'jwk' }) as Record<string, string>;
    const service = serviceOver([
      {
        kid: LEGACY_KID,
        status: 'ACTIVE',
        publicJwk,
        privateKeyEnvelope: null,
        privateKeyCiphertext: LEGACY_SIGNING_KEY.ciphertext,
        privateKeyIv: LEGACY_SIGNING_KEY.iv,
        privateKeyAuthTag: LEGACY_SIGNING_KEY.authTag,
      },
    ]);

    await service.reload();

    expect(service.verify(service.sign({ sub: 'user-1' }).token)).toEqual({ sub: 'user-1' });
  });
});
