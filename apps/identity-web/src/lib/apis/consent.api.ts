/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type ConsentRecordDto, type ConsentRecordsResponse } from './api-types.gen';
import { serverFetch } from './server-fetch';

/**
 * Defining types
 */

/** A standing OAuth consent grant the user can review and revoke — distinct from the sign-in consent prompt in `auth.api.ts`. */
export type ConsentRecord = ConsentRecordDto;
export type ConsentSource = ConsentRecordDto['source'];
export type { ConsentRecordsResponse };

/**
 * Declaring the constants
 */
export const consentKeys = {
  all: ['me', 'consents'] as const,
};

const fetchConsents = createServerFn({ method: 'GET' }).handler(() => serverFetch<ConsentRecordsResponse>({ method: 'GET', path: '/me/consents' }));
const revokeConsent = createServerFn({ method: 'POST' })
  .validator((clientId: string) => clientId)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/me/consents/${encodeURIComponent(data)}` }));

/** The apps the user has granted access to, with the scopes each still holds. */
export const consentsQueryOptions = () =>
  queryOptions<ConsentRecordsResponse, ApiError>({
    queryKey: consentKeys.all,
    queryFn: () => call(fetchConsents()),
  });

export function useMyConsentsQuery(): UseQueryResult<ConsentRecordsResponse, ApiError> {
  return useQuery(consentsQueryOptions());
}

/** Withdraws a client's consent; the app must ask again the next time it needs those scopes. */
export function useRevokeConsentMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: clientId => call(revokeConsent({ data: clientId })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: consentKeys.all }),
  });
}
