import { describe, expect, it } from 'bun:test';

import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { IdentityProviderService } from '@server/modules/auth/federation/identity-provider.service';
import { type IdentityProvider } from '@server/modules/infrastructure/datastore';

import { IDENTITY_PROVIDER_SECRET, LEGACY_IDENTITY_PROVIDER, sealerFor } from './keys.fixtures';

const PROVIDER_ID = '22222222-2222-4222-8222-222222222222';

function legacyProvider(): IdentityProvider {
  return {
    id: PROVIDER_ID,
    organisationId: 5n,
    kind: 'OIDC',
    clientSecretEnvelope: null,
    clientSecretCiphertext: LEGACY_IDENTITY_PROVIDER.ciphertext,
    clientSecretIv: LEGACY_IDENTITY_PROVIDER.iv,
    clientSecretAuthTag: LEGACY_IDENTITY_PROVIDER.authTag,
  } as IdentityProvider;
}

function serviceOver(stored: IdentityProvider): IdentityProviderService {
  const postgres = {
    query: { identityProviders: { findFirst: () => Promise.resolve(stored) } },
    update: () => ({ set: (values: Partial<IdentityProvider>) => ({ where: () => ({ returning: () => Promise.resolve([{ ...stored, ...values }]) }) }) }),
  };
  const none = {} as never;
  return new IdentityProviderService(new FakeDatabaseService({ postgres }), sealerFor(), none, none);
}

describe('IdentityProviderService client secret', () => {
  it('should hand the federation exchange the secret the previous image stored', async () => {
    const provider = legacyProvider();

    expect(await serviceOver(provider).decryptClientSecret(provider)).toBe(IDENTITY_PROVIDER_SECRET);
  });

  it('should seal a replaced secret under the stored id, however the caller spelled it', async () => {
    const service = serviceOver(legacyProvider());

    const updated = await service.update(5n, PROVIDER_ID.toUpperCase(), { clientSecret: 'replaced-secret' });

    expect({ secret: await service.decryptClientSecret(updated), legacyKept: updated.clientSecretCiphertext }).toEqual({
      secret: 'replaced-secret',
      legacyKept: LEGACY_IDENTITY_PROVIDER.ciphertext,
    });
  });
});
