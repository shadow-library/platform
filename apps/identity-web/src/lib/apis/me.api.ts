/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import { type MeResponse, type UpdateProfileBody } from './api-types.gen';

/**
 * Defining types
 */

/** `GET /me` — profile basics plus the current session's assurance, for first-party surfaces. */
export type { MeResponse, UpdateProfileBody };

/**
 * Declaring the constants
 */
export const meKeys = {
  all: ['me'] as const,
};

/**
 * The signed-in identity. A 401 here means "no session" — the portal shell reads that to bounce to
 * the hosted sign-in — so this query never retries (a retry would just re-confirm the 401).
 */
export function useMeQuery(enabled = true): UseQueryResult<MeResponse, ApiError> {
  return useQuery<MeResponse, ApiError>({
    queryKey: meKeys.all,
    queryFn: () => APIRequest.get('/me').execute(),
    retry: false,
    enabled,
  });
}

/** Updates the signed-in user's display name; the fresh `MeResponse` seeds the cache so the UI reflects it at once. */
export function useUpdateProfileMutation(): UseMutationResult<MeResponse, ApiError, UpdateProfileBody> {
  const queryClient = useQueryClient();
  return useMutation<MeResponse, ApiError, UpdateProfileBody>({
    mutationFn: body => APIRequest.patch('/me/profile').body(body).execute(),
    onSuccess: data => queryClient.setQueryData(meKeys.all, data),
  });
}
