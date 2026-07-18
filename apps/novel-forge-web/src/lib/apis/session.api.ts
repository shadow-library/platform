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
 * The BINDING flat session contract of novel-forge-server's first-party session surface:
 * `GET /api/auth/session` answers 200 with this shape for an established session and 401 otherwise —
 * never a 200 null.
 */
export interface SessionResponse {
  userId: string;
  email?: string;
  name?: string;
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
