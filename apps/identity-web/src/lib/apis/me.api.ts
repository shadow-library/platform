/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type ChangePasswordBody, type ChangePasswordResponse, type MeResponse, type UpdateProfileBody } from './api-types.gen';
import { sessionKeys } from './session.api';
import { type ApiError, APIRequest } from './transport';

/**
 * Defining types
 */

/** `GET /me` — profile basics plus the current session's assurance, for first-party surfaces. */
export type { ChangePasswordBody, MeResponse, UpdateProfileBody };

/**
 * Declaring the constants
 */
export const meKeys = {
  all: ['me'] as const,
};

/**
 * Route-critical: the signed-in identity. A 401 here means "no session" — the portal/console guards
 * read that to bounce to the hosted sign-in — so this query never retries (a retry would just re-confirm
 * the 401). Loaders ensure it; components read the warm cache.
 */
export const meQueryOptions = (enabled = true) =>
  queryOptions<MeResponse, ApiError>({
    queryKey: meKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/me').signal(signal).execute<MeResponse>(),
    retry: false,
    enabled,
  });

export function useMeQuery(enabled = true): UseQueryResult<MeResponse, ApiError> {
  return useQuery(meQueryOptions(enabled));
}

/** Updates the signed-in user's display name; the fresh `MeResponse` seeds the cache so the UI reflects it at once. */
export function useUpdateProfileMutation(): UseMutationResult<MeResponse, ApiError, UpdateProfileBody> {
  const queryClient = useQueryClient();
  return useMutation<MeResponse, ApiError, UpdateProfileBody>({
    mutationFn: body => APIRequest.patch('/me/profile').body(body).execute<MeResponse>(),
    onSuccess: data => queryClient.setQueryData(meKeys.all, data),
  });
}

/**
 * Rotates the signed-in user's password after re-proving the current one. The server signs out every other
 * session, so the sessions list is invalidated to drop the ones that just ended. A wrong current password
 * surfaces as a thrown `ApiError` (401) the caller maps to a field message.
 */
export function useChangePasswordMutation(): UseMutationResult<ChangePasswordResponse, ApiError, ChangePasswordBody> {
  const queryClient = useQueryClient();
  return useMutation<ChangePasswordResponse, ApiError, ChangePasswordBody>({
    mutationFn: body => APIRequest.post('/me/password').body(body).execute<ChangePasswordResponse>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
