import { afterEach, describe, expect, it } from 'bun:test';

import { setConfig } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { RecoveryCodeService } from '@server/modules/auth/mfa/recovery-code.service';
import { SamlService } from '@server/modules/auth/saml/saml.service';

import { HEAD_DERIVED, HMAC_DEV_DEFAULT, HMAC_TEST_KEY, RECOVERY_CODE_NORMALIZED, SAML_SUBJECT } from './keys.fixtures';

let restoreConfig: (() => void) | undefined;

afterEach(() => restoreConfig?.());

function derivedWith(hmacKey: string): { samlNameId: string; recoveryLookupHash: string } {
  restoreConfig = setConfig({ 'identity.hmac-key': hmacKey, 'oauth.issuer': 'https://identity.test' });
  const none = {} as never;
  const databaseService = new FakeDatabaseService();
  const saml = new SamlService(databaseService, none, none, none, none, none, none);
  const recovery = new RecoveryCodeService(databaseService, none, none, none, none);
  return { samlNameId: saml['pairwiseNameId'](SAML_SUBJECT.userId, SAML_SUBJECT.entityId), recoveryLookupHash: recovery['lookupHash'](RECOVERY_CODE_NORMALIZED) };
}

describe('identity.hmac-key derivations', () => {
  it('should reproduce the SAML NameID and recovery-code lookup hash the master key produced before the keyring', () => {
    expect(derivedWith(HMAC_TEST_KEY)).toEqual(HEAD_DERIVED[HMAC_TEST_KEY]);
  });

  it('should keep the values local data was derived with under the former dev default', () => {
    expect(derivedWith(HMAC_DEV_DEFAULT)).toEqual(HEAD_DERIVED[HMAC_DEV_DEFAULT]);
  });
});
