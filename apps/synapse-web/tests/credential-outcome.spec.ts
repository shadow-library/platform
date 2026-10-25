import { describe, expect, it } from 'bun:test';
import { isApiError } from '@shadow-library/web';

import { type CredentialResponse } from '../src/lib/apis/api-types.gen';
import { revokeOutcome } from '../src/lib/apis/credential-outcome';

const CREDENTIAL: CredentialResponse = {
  id: '6f1c1c9e-3a52-4c63-9d7d-0d3d6a5b0c11',
  name: 'openrouter',
  allowedOrigin: 'https://openrouter.ai',
  hint: 'sk-or-…a1b2',
  version: 2,
  createdAt: '2026-10-01T00:00:00.000Z',
  createdByName: null,
  referencedBy: [],
};

describe('revokeOutcome', () => {
  it('should read a body without an error code as the revoked credential', () => {
    expect(revokeOutcome({ ...CREDENTIAL, revokedAt: '2026-10-19T00:00:00.000Z' })).toEqual({
      kind: 'revoked',
      credential: { ...CREDENTIAL, revokedAt: '2026-10-19T00:00:00.000Z' },
    });
  });

  it('should read the in-use conflict as the providers that still name the credential', () => {
    expect(revokeOutcome({ code: 'CRED_IN_USE', message: 'The published catalog still uses this credential', referencedBy: ['openrouter', 'fallback'] })).toEqual({
      kind: 'in_use',
      message: 'The published catalog still uses this credential',
      referencedBy: ['openrouter', 'fallback'],
    });
  });

  it('should read an in-use conflict without a usable list as naming no provider', () => {
    const outcome = revokeOutcome({ code: 'CRED_IN_USE', message: 'in use' } as never);
    expect(outcome).toEqual({ kind: 'in_use', message: 'in use', referencedBy: [] });
  });

  it('should throw any other conflict as an api error', () => {
    let thrown: unknown;
    try {
      revokeOutcome({ code: 'CRED_REVOKED', message: 'The credential is revoked', referencedBy: [] });
    } catch (error) {
      thrown = error;
    }
    expect(isApiError(thrown) && thrown.status === 409 && thrown.code === 'CRED_REVOKED').toBe(true);
  });
});
