import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { type Envelope } from '@shadow-library/common/crypto';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { SEALED_COLUMNS } from '@server/modules/auth/keys/sealed-secret.constants';
import { backfillSealedSecrets } from '@server/modules/auth/keys/secret-backfill';

import {
  type FakeSealedRow,
  FakeSealedSecretStore,
  IDENTITY_PROVIDER_SECRET,
  LEGACY_IDENTITY_PROVIDER,
  LEGACY_MFA_SECRET,
  LEGACY_SIGNING_KEY,
  LEGACY_WEBHOOK_CURRENT,
  LEGACY_WEBHOOK_PREVIOUS,
  sealerFor,
  SIGNING_KEY_DER_HEX,
  TOTP_SECRET_HEX,
  WEBHOOK_CURRENT_SECRET,
  WEBHOOK_PREVIOUS_SECRET,
} from './keys.fixtures';

const IDP_ID = '22222222-2222-4222-8222-222222222222';
const SIGNING_KID = '11111111-1111-4111-8111-111111111111';

let restoreLogger: RestoreLogger;
let store: FakeSealedSecretStore;

beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());
beforeEach(() => (store = new FakeSealedSecretStore()));

async function opened(row: FakeSealedRow): Promise<Buffer> {
  return sealerFor().open({ envelope: row.envelope as Envelope, legacy: null }, row.column, row.id);
}

describe('backfillSealedSecrets', () => {
  it('should seal every legacy column into an envelope holding the identical plaintext', async () => {
    const signingKey = store.add(SEALED_COLUMNS.signingKey, SIGNING_KID, LEGACY_SIGNING_KEY);
    const provider = store.add(SEALED_COLUMNS.identityProvider, IDP_ID, LEGACY_IDENTITY_PROVIDER);
    const mfa = store.add(SEALED_COLUMNS.mfaSecret, '7', LEGACY_MFA_SECRET);
    const current = store.add(SEALED_COLUMNS.webhookSecret, '3', LEGACY_WEBHOOK_CURRENT);
    const previous = store.add(SEALED_COLUMNS.webhookPreviousSecret, '3', LEGACY_WEBHOOK_PREVIOUS);

    const result = await backfillSealedSecrets(store, sealerFor());

    expect(result).toEqual({ sealed: 5, skipped: 0, failed: [] });
    expect({
      signingKey: (await opened(signingKey)).toString('hex'),
      provider: (await opened(provider)).toString(),
      mfa: (await opened(mfa)).toString('hex'),
      current: (await opened(current)).toString(),
      previous: (await opened(previous)).toString(),
    }).toEqual({ signingKey: SIGNING_KEY_DER_HEX, provider: IDENTITY_PROVIDER_SECRET, mfa: TOTP_SECRET_HEX, current: WEBHOOK_CURRENT_SECRET, previous: WEBHOOK_PREVIOUS_SECRET });
  });

  it('should bind each envelope to its own row and column', async () => {
    const current = store.add(SEALED_COLUMNS.webhookSecret, '3', LEGACY_WEBHOOK_CURRENT);
    await backfillSealedSecrets(store, sealerFor());

    await expect(sealerFor().open({ envelope: current.envelope as Envelope, legacy: null }, SEALED_COLUMNS.webhookPreviousSecret, '3')).rejects.toThrow();
    await expect(sealerFor().open({ envelope: current.envelope as Envelope, legacy: null }, SEALED_COLUMNS.webhookSecret, '4')).rejects.toThrow();
  });

  it('should leave rows that already hold an envelope, and rows with no secret, untouched', async () => {
    const sealed = await sealerFor().seal('already', SEALED_COLUMNS.mfaSecret, '1');
    const existing = store.add(SEALED_COLUMNS.mfaSecret, '1', LEGACY_MFA_SECRET, sealed);
    const webauthn = store.add(SEALED_COLUMNS.mfaSecret, '2', null);
    const noPrevious = store.add(SEALED_COLUMNS.webhookPreviousSecret, '3', null);

    const result = await backfillSealedSecrets(store, sealerFor());

    expect(result).toEqual({ sealed: 0, skipped: 0, failed: [] });
    expect([existing.envelope, webauthn.envelope, noPrevious.envelope]).toEqual([sealed, null, null]);
  });

  it('should resume a partially backfilled table across batches', async () => {
    for (const id of ['1', '2', '3', '4', '5']) store.add(SEALED_COLUMNS.mfaSecret, id, LEGACY_MFA_SECRET);
    await backfillSealedSecrets(store, sealerFor(), 2);
    store.add(SEALED_COLUMNS.mfaSecret, '6', LEGACY_MFA_SECRET);

    const rerun = await backfillSealedSecrets(store, sealerFor(), 2);

    expect(rerun).toEqual({ sealed: 1, skipped: 0, failed: [] });
    expect(store.rows.every(row => row.envelope !== null)).toBe(true);
  });

  it('should report every unreadable row by id while sealing the rest', async () => {
    store.add(SEALED_COLUMNS.mfaSecret, '1', LEGACY_MFA_SECRET);
    store.add(SEALED_COLUMNS.mfaSecret, '2', 'not json');
    store.add(SEALED_COLUMNS.identityProvider, IDP_ID, { ...LEGACY_IDENTITY_PROVIDER, authTag: LEGACY_SIGNING_KEY.authTag });

    const result = await backfillSealedSecrets(store, sealerFor());

    expect(result).toEqual({
      sealed: 1,
      skipped: 0,
      failed: [
        { column: 'identity_providers.client_secret', id: IDP_ID },
        { column: 'mfa_enrollments.secret', id: '2' },
      ],
    });
  });

  it('should skip a row an old image rewrote between the read and the write', async () => {
    const row = store.add(SEALED_COLUMNS.webhookSecret, '3', LEGACY_WEBHOOK_CURRENT);
    store.beforeWrite = target => (target.legacy = LEGACY_WEBHOOK_PREVIOUS);

    const result = await backfillSealedSecrets(store, sealerFor());

    expect({ result, envelope: row.envelope }).toEqual({ result: { sealed: 0, skipped: 1, failed: [] }, envelope: null });
  });
});
