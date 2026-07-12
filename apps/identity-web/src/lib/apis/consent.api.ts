/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import { type ConsentRecordDto, type ConsentRecordsResponse } from './api-types.gen';

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

/** The apps the user has granted access to, with the scopes each still holds. */
export function useMyConsentsQuery(): UseQueryResult<ConsentRecordsResponse, ApiError> {
  return useQuery<ConsentRecordsResponse, ApiError>({
    queryKey: consentKeys.all,
    queryFn: () => APIRequest.get('/me/consents').execute(),
  });
}

/** Withdraws a client's consent; the app must ask again the next time it needs those scopes. */
export function useRevokeConsentMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: clientId => APIRequest.delete(`/me/consents/${encodeURIComponent(clientId)}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: consentKeys.all }),
  });
}
