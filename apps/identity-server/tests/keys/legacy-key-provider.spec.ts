import { describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { CryptoErrorCode } from '@shadow-library/common/crypto';

import { LegacyKeyProvider, type StoredLegacySecret } from '@server/modules/auth/keys/legacy-key-provider';

import {
  HMAC_TEST_KEY,
  IDENTITY_PROVIDER_SECRET,
  LEGACY_IDENTITY_PROVIDER,
  LEGACY_MFA_SECRET,
  LEGACY_SIGNING_KEY,
  LEGACY_WEBHOOK_CURRENT,
  LEGACY_WEBHOOK_PREVIOUS,
  SIGNING_KEY_DER_HEX,
  TOTP_SECRET_HEX,
  WEBHOOK_CURRENT_SECRET,
  WEBHOOK_PREVIOUS_SECRET,
} from './keys.fixtures';

function failure(provider: LegacyKeyProvider, stored: StoredLegacySecret): unknown {
  try {
    provider.decrypt(stored);
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('LegacyKeyProvider', () => {
  const provider = new LegacyKeyProvider(HMAC_TEST_KEY);

  it('should decrypt every legacy column format the previous image wrote', () => {
    expect({
      signingKey: provider.decrypt(LEGACY_SIGNING_KEY).toString('hex'),
      identityProvider: provider.decrypt(LEGACY_IDENTITY_PROVIDER).toString(),
      mfa: provider.decrypt(LEGACY_MFA_SECRET).toString('hex'),
      webhookCurrent: provider.decrypt(LEGACY_WEBHOOK_CURRENT).toString(),
      webhookPrevious: provider.decrypt(LEGACY_WEBHOOK_PREVIOUS).toString(),
    }).toEqual({
      signingKey: SIGNING_KEY_DER_HEX,
      identityProvider: IDENTITY_PROVIDER_SECRET,
      mfa: TOTP_SECRET_HEX,
      webhookCurrent: WEBHOOK_CURRENT_SECRET,
      webhookPrevious: WEBHOOK_PREVIOUS_SECRET,
    });
  });

  it('should refuse a legacy secret under any other hmac key', () => {
    expect(AppError.is(failure(new LegacyKeyProvider(`${HMAC_TEST_KEY}x`), LEGACY_IDENTITY_PROVIDER), CryptoErrorCode.DECRYPTION_FAILED)).toBe(true);
  });

  it('should refuse a serialized secret that is not the three-field json', () => {
    expect(AppError.is(failure(provider, 'not json'), CryptoErrorCode.DECRYPTION_FAILED)).toBe(true);
    expect(AppError.is(failure(provider, '{"ciphertext":"x"}'), CryptoErrorCode.DECRYPTION_FAILED)).toBe(true);
  });

  it('should refuse a tampered tag', () => {
    expect(AppError.is(failure(provider, { ...LEGACY_SIGNING_KEY, authTag: LEGACY_IDENTITY_PROVIDER.authTag }), CryptoErrorCode.DECRYPTION_FAILED)).toBe(true);
  });
});
