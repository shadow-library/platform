/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type MeResponse, type UpdateProfileBody } from './api-types.gen';
import { serverFetch } from './server-fetch';

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

const fetchMe = createServerFn({ method: 'GET' }).handler(() => serverFetch<MeResponse>({ method: 'GET', path: '/me' }));

const updateProfile = createServerFn({ method: 'POST' })
  .validator((body: UpdateProfileBody) => body)
  .handler(({ data }) => serverFetch<MeResponse>({ method: 'PATCH', path: '/me/profile', body: data }));

/**
 * Route-critical: the signed-in identity. A 401 here means "no session" — the portal/console guards
 * read that to bounce to the hosted sign-in — so this query never retries (a retry would just re-confirm
 * the 401). Loaders ensure it; components read the warm cache.
 */
export const meQueryOptions = (enabled = true) =>
  queryOptions<MeResponse, ApiError>({
    queryKey: meKeys.all,
    queryFn: () => call(fetchMe()),
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
    mutationFn: body => call(updateProfile({ data: body })),
    onSuccess: data => queryClient.setQueryData(meKeys.all, data),
  });
}
