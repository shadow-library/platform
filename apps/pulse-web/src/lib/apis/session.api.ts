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
 * The `/api/auth/session` contract, owned end-to-end by `@shadow-library/auth`'s first-party browser
 * flow on pulse-server: 200 with the principal descriptor for an authenticated app-session cookie,
 * 401 otherwise (never a 200 with a null body). The cookie carries an opaque handle, never a token —
 * the server resolves it to this shape and pulse-web only ever gates on presence, never on the fields.
 */
export interface SessionResponse {
  sub: string;
  scopes: string[];
  org?: string;
  /** `AAL2` only while a step-up grant for pulse's audience is live */
  aal?: string;
  clientId?: string;
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

/**
 * Ends the app session on pulse-server (`POST /api/auth/logout`). The SDK revokes the session and
 * clears the `__Host-shadow-session` cookie; the central identity session is deliberately untouched.
 */
export function logout(): Promise<{ success: boolean }> {
  return APIRequest.post('/api/auth/logout').execute<{ success: boolean }>();
}
