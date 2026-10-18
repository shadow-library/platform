import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import {
  type CreateCredentialBody,
  type CredentialInUseResponse,
  type CredentialListResponse,
  type CredentialResponse,
  type CredentialTestResponse,
  type RotateCredentialBody,
} from './api-types.gen';
import { CONFLICT, revokeOutcome, type RevokeOutcome } from './credential-outcome';
import { type ApiError, APIRequest } from './transport';

export const credentialKeys = { all: ['credentials'] } as const;

export const credentialsQueryOptions = (): UseQueryOptions<CredentialListResponse, ApiError> =>
  queryOptions<CredentialListResponse, ApiError>({
    queryKey: credentialKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/admin/credentials').signal(signal).execute(),
  });

const credentialPath = (id: string): string => `/admin/credentials/${encodeURIComponent(id)}`;

/** Plain calls rather than mutations: a mutation cache keeps its variables, and so the secret, in memory and in the devtools after the dialog has closed. */
export const createCredential = (body: CreateCredentialBody): Promise<CredentialResponse> => APIRequest.post('/admin/credentials').body(body).execute();

export const rotateCredential = (id: string, secret: string): Promise<CredentialResponse> => {
  const body: RotateCredentialBody = { secret };
  return APIRequest.put(`${credentialPath(id)}/secret`)
    .body(body)
    .execute();
};

export const testCredential = (id: string): Promise<CredentialTestResponse> => APIRequest.post(`${credentialPath(id)}/test`).execute();

export async function revokeCredential(id: string): Promise<RevokeOutcome> {
  return revokeOutcome(await APIRequest.delete(credentialPath(id)).modeled(CONFLICT).execute<CredentialResponse | CredentialInUseResponse>());
}
