/**
 * Importing npm packages
 */
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { call } from '@shadow-library/web';

/**
 * Importing user defined packages
 */
import { type ApiError } from './api-request';
import { serverAuthFetch } from './server-fetch';

/**
 * Defining types
 */

/**
 * ASSUMED CONTRACT — the backend has not migrated yet. The relying-party auth package exposes no HTTP
 * routes of its own (session management is left to the consuming app), so this codes against
 * `GET /api/auth/session` returning the signed-in user and answering 401 when there is no session.
 * Adjust here (and in `server-fetch.ts`) once novel-forge-server lands its real surface.
 */
export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
}

export interface SessionResponse {
  user: SessionUser;
}

/**
 * Declaring the constants
 */
const sessionKeys = {
  current: ['auth', 'session'] as const,
};

const fetchSession = createServerFn({ method: 'GET' }).handler(() => serverAuthFetch<SessionResponse>({ method: 'GET', path: '/session' }));

/**
 * Route-critical: the signed-in identity. A 401 here means "no session" — the route gates read that to
 * bounce to the backend's login redirect — so this query never retries (a retry would just re-confirm the
 * 401). `beforeLoad` gates ensure it; components read the warm cache.
 */
export const sessionQuery = queryOptions<SessionResponse, ApiError>({
  queryKey: sessionKeys.current,
  queryFn: () => call(fetchSession()),
  retry: false,
  staleTime: 60_000,
});

export function useSessionQuery(): UseQueryResult<SessionResponse, ApiError> {
  return useQuery(sessionQuery);
}
