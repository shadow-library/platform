import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { type ConsentRecordDto, type ConsentRecordsResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

/** A standing OAuth consent grant the user can review and revoke — distinct from the sign-in consent prompt in `auth.api.ts`. */
export type ConsentRecord = ConsentRecordDto;
export type ConsentSource = ConsentRecordDto['source'];
export type { ConsentRecordsResponse };

export const consentKeys = {
  all: ['me', 'consents'] as const,
};

export const consentsQueryOptions = () =>
  queryOptions<ConsentRecordsResponse, ApiError>({
    queryKey: consentKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/me/consents').signal(signal).execute<ConsentRecordsResponse>(),
  });

export function useMyConsentsQuery(): UseQueryResult<ConsentRecordsResponse, ApiError> {
  return useQuery(consentsQueryOptions());
}

export function useRevokeConsentMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: clientId => APIRequest.delete(`/me/consents/${encodeURIComponent(clientId)}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: consentKeys.all }),
  });
}
