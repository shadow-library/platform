import { ApiError, type ErrorResponse } from '@shadow-library/web';

import { type CredentialInUseResponse, type CredentialResponse } from './api-types.gen';

export const CONFLICT = 409;

const CREDENTIAL_IN_USE = 'CRED_IN_USE';

export type RevokeOutcome = { kind: 'revoked'; credential: CredentialResponse } | { kind: 'in_use'; message: string; referencedBy: string[] };

/** Revoking answers 409 `CRED_IN_USE` with the referencing providers as part of the contract, so it is modeled and told apart from a credential by the `code` only an error body carries. */
export function revokeOutcome(body: CredentialResponse | CredentialInUseResponse): RevokeOutcome {
  const code = (body as { code?: unknown }).code;
  if (typeof code !== 'string') return { kind: 'revoked', credential: body as CredentialResponse };
  const failure = body as CredentialInUseResponse;
  if (code === CREDENTIAL_IN_USE) {
    const referencedBy = Array.isArray(failure.referencedBy) ? failure.referencedBy.filter(key => typeof key === 'string') : [];
    return { kind: 'in_use', message: failure.message, referencedBy };
  }
  throw new ApiError(CONFLICT, { type: 'CLIENT_ERROR', ...(body as Partial<ErrorResponse>), code, message: failure.message ?? 'The request was rejected' });
}
