import { describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { SEALED_COLUMNS } from '@server/modules/auth/keys/sealed-secret.constants';
import { sealedSecretContext } from '@server/modules/auth/keys/secret-sealer.service';

import { IDENTITY_PROVIDER_SECRET, LEGACY_IDENTITY_PROVIDER, sealerFor } from './keys.fixtures';

const IDP_ID = '22222222-2222-4222-8222-222222222222';

describe('SecretSealer', () => {
  it('should name the row and column in the context', () => {
    expect([sealedSecretContext(SEALED_COLUMNS.signingKey, IDP_ID), sealedSecretContext(SEALED_COLUMNS.webhookPreviousSecret, 7n)]).toEqual([
      `identity:signing_keys:${IDP_ID}:private_key`,
      'identity:webhook_subscriptions:7:previous_secret',
    ]);
  });

  it('should read the envelope and ignore the stale legacy columns beside it', async () => {
    const envelope = await sealerFor().seal('rotated-secret', SEALED_COLUMNS.identityProvider, IDP_ID);

    const secret = await sealerFor().open({ envelope, legacy: LEGACY_IDENTITY_PROVIDER }, SEALED_COLUMNS.identityProvider, IDP_ID);

    expect(secret.toString()).toBe('rotated-secret');
  });

  it('should fall back to the legacy columns for a row the previous image wrote during the rollout', async () => {
    const secret = await sealerFor().open({ envelope: null, legacy: LEGACY_IDENTITY_PROVIDER }, SEALED_COLUMNS.identityProvider, IDP_ID);

    expect(secret.toString()).toBe(IDENTITY_PROVIDER_SECRET);
  });

  it('should report a row holding no secret at all', async () => {
    const error = await sealerFor()
      .open({ envelope: null, legacy: null }, SEALED_COLUMNS.identityProvider, IDP_ID)
      .catch((reason: unknown) => reason);

    expect(AppError.is(error, AppErrorCode.KEY_001)).toBe(true);
  });
});
