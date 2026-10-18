import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { type RestoreConfig, type RestoreLogger, setConfig, silenceLogger } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { MfaService } from '@server/modules/auth/mfa/mfa.service';
import { base32Decode, hotp } from '@server/modules/auth/mfa/totp';
import { type MfaEnrollment } from '@server/modules/infrastructure/datastore';

import { LEGACY_MFA_SECRET, sealerFor, TOTP_SECRET_HEX } from '../keys/keys.fixtures';

const RESERVED_ID = 41n;

let restoreConfig: RestoreConfig;
let restoreLogger: RestoreLogger;

beforeAll(() => {
  restoreConfig = setConfig({ 'oauth.issuer': 'https://identity.test' });
  restoreLogger = silenceLogger();
});

afterAll(() => {
  restoreConfig();
  restoreLogger();
});

function currentCode(secret: Buffer): string {
  return hotp(secret, Math.floor(Date.now() / 1000 / 30));
}

function serviceOver(initial?: Partial<MfaEnrollment>) {
  const state: { enrollment?: Partial<MfaEnrollment> } = { enrollment: initial };
  const tx = {
    delete: () => ({ where: () => Promise.resolve() }),
    execute: () => Promise.resolve([{ id: RESERVED_ID.toString() }]),
    insert: () => ({
      values: (row: Partial<MfaEnrollment>) => ((state.enrollment = { verifiedAt: new Date(), lastUsedCounter: null, secretCiphertext: null, ...row }), Promise.resolve()),
    }),
  };
  const postgres = {
    transaction: (work: (handle: unknown) => Promise<unknown>) => work(tx),
    query: { mfaEnrollments: { findFirst: () => Promise.resolve(state.enrollment) } },
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };
  const none = {} as never;
  const userEmailService = { getPrimaryEmail: () => Promise.resolve('ada@example.com') } as never;
  const service = new MfaService(new FakeDatabaseService({ postgres }), sealerFor(), userEmailService, none, none, none, none, none, none, none);
  return { service, state };
}

describe('MfaService TOTP secrets', () => {
  it('should verify a code against the secret it sealed at enrolment under the reserved row id', async () => {
    const { service, state } = serviceOver();

    const provisioning = await service.enrollTotp(1n);

    expect({ id: state.enrollment?.id, kid: state.enrollment?.secretEnvelope?.kid, legacy: state.enrollment?.secretCiphertext }).toEqual({
      id: RESERVED_ID,
      kid: 'k1',
      legacy: null,
    });
    expect(await service.verifyTotp(1n, currentCode(base32Decode(provisioning.secret)))).toBe(true);
  });

  it('should verify a code against an enrolment the previous image wrote in the legacy column', async () => {
    const { service } = serviceOver({
      id: 9n,
      userId: 1n,
      type: 'TOTP',
      verifiedAt: new Date(),
      lastUsedCounter: null,
      secretEnvelope: null,
      secretCiphertext: LEGACY_MFA_SECRET,
      kekVersion: 1,
    });

    expect(await service.verifyTotp(1n, currentCode(Buffer.from(TOTP_SECRET_HEX, 'hex')))).toBe(true);
  });

  it('should reject a code once the enrolment is sealed under another row id', async () => {
    const { service, state } = serviceOver();
    const provisioning = await service.enrollTotp(1n);
    state.enrollment = { ...state.enrollment, id: RESERVED_ID + 1n };

    await expect(service.verifyTotp(1n, currentCode(base32Decode(provisioning.secret)))).rejects.toThrow();
  });
});
