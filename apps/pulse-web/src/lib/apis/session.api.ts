/**
 * Importing npm packages
 */
import { type EnsureQueryDataOptions } from '@tanstack/react-query';
import { APIRequest } from '@shadow-library/web';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * The session surface pulse-server will expose once it adopts `RelyingPartyModule` from
 * `@shadow-library/auth`. The module ships only the OIDC protocol core (authorization URL, code
 * exchange, refresh) and leaves the HTTP session surface to the consuming app, so this contract is
 * the agreed target: `GET /api/auth/session` answers 200 with the session payload for an
 * authenticated cookie and 401 otherwise.
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
  session: ['session'],
} as const;

export function sessionQueryOptions(): EnsureQueryDataOptions<SessionResponse> {
  return {
    queryKey: sessionKeys.session,
    queryFn: ({ signal }) => APIRequest.get('/api/auth/session').signal(signal).execute<SessionResponse>(),
    /** A 401 means "no session" — retrying would only re-confirm it before the login bounce. */
    retry: false,
    /**
     * The session mirrors live auth state, so it is never treated as fresh: the route gate and the
     * in-shell `useSessionGuard` both re-validate against the server instead of trusting a cached
     * snapshot, so the shell is shown only while the session is currently valid.
     */
    staleTime: 0,
  };
}
