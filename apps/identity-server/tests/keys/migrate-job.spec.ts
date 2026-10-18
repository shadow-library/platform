import { describe, expect, it, mock } from 'bun:test';

import { AppError, type Logger } from '@shadow-library/common';

import { backfillSealedSecrets } from '@server/modules/auth/keys/secret-backfill';
import { SEALED_COLUMNS } from '@server/modules/auth/keys/sealed-secret.constants';
import { runMigrateJob } from '@server/migrate.job';

import { FakeSealedSecretStore, LEGACY_MFA_SECRET, LEGACY_WEBHOOK_CURRENT, sealerFor, WEBHOOK_CURRENT_SECRET } from './keys.fixtures';

function recordingLogger() {
  const errors: unknown[][] = [];
  const logger = { info: mock(), warn: mock(), debug: mock(), error: (...args: unknown[]) => errors.push(args) } as unknown as Logger;
  return { logger, errors };
}

describe('runMigrateJob', () => {
  it('should exit zero once the migrations apply and every legacy row is sealed', async () => {
    const store = new FakeSealedSecretStore();
    store.add(SEALED_COLUMNS.mfaSecret, '1', LEGACY_MFA_SECRET);
    const { logger } = recordingLogger();

    const exitCode = await runMigrateJob({ prepareBackfill: () => () => backfillSealedSecrets(store, sealerFor()), migrate: () => Promise.resolve() }, logger);

    expect(exitCode).toBe(0);
  });

  it('should fail the job when a row cannot be sealed, naming the row and never its value', async () => {
    const store = new FakeSealedSecretStore();
    store.add(SEALED_COLUMNS.webhookSecret, '3', LEGACY_WEBHOOK_CURRENT);
    store.add(SEALED_COLUMNS.webhookSecret, '4', '{"ciphertext":"tampered","iv":"x","authTag":"y"}');
    const { logger, errors } = recordingLogger();

    const exitCode = await runMigrateJob({ prepareBackfill: () => () => backfillSealedSecrets(store, sealerFor()), migrate: () => Promise.resolve() }, logger);

    expect(exitCode).toBe(1);
    expect(errors.at(-1)?.[1]).toMatchObject({ failed: [{ column: 'webhook_subscriptions.secret', id: '4' }], sealed: 1 });
    expect(JSON.stringify(errors)).not.toContain(WEBHOOK_CURRENT_SECRET);
  });

  it('should fail the job without backfilling when the schema migration fails', async () => {
    const backfill = mock(() => Promise.resolve({ sealed: 0, skipped: 0, failed: [] }));
    const { logger } = recordingLogger();

    const exitCode = await runMigrateJob({ prepareBackfill: () => backfill, migrate: () => Promise.reject(AppError.internal('relation exists')) }, logger);

    expect({ exitCode, backfilled: backfill.mock.calls.length }).toEqual({ exitCode: 1, backfilled: 0 });
  });

  it('should fail the job before any schema change when the keyring is malformed', async () => {
    const migrate = mock(() => Promise.resolve());
    const { logger } = recordingLogger();

    const prepareBackfill = () => {
      const sealer = sealerFor('k1:not-a-key');
      return () => backfillSealedSecrets(new FakeSealedSecretStore(), sealer);
    };

    const exitCode = await runMigrateJob({ prepareBackfill, migrate }, logger);

    expect({ exitCode, migrated: migrate.mock.calls.length }).toEqual({ exitCode: 1, migrated: 0 });
  });

  it('should fail the job when the backfill itself throws', async () => {
    const { logger } = recordingLogger();

    const exitCode = await runMigrateJob({ prepareBackfill: () => () => Promise.reject(AppError.internal('connection lost')), migrate: () => Promise.resolve() }, logger);

    expect(exitCode).toBe(1);
  });
});
