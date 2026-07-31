/**
 * Importing npm packages
 */
import { type EnsureQueryDataOptions, type UseQueryOptions } from '@tanstack/react-query';
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
 * The `/api/auth/session` contract, owned end-to-end by `@shadow-library/auth`'s first-party browser
 * flow on pulse-server: 200 with the principal descriptor for an authenticated app-session cookie,
 * 401 otherwise (never a 200 with a null body). The cookie carries an opaque handle, never a token —
 * the server resolves it to this shape and pulse-web only ever gates on presence, never on the fields.
 */
export interface SessionResponse {
  sub: string;
  scopes: string[];
  /** The organisation this session acts in; every permission on every request is evaluated there */
  org?: string;
  /** `AAL2` only while a step-up grant for pulse's audience is live */
  aal?: string;
  clientId?: string;
}

/** One organisation the signed-in operator reaches pulse through */
export interface OrganisationResponse {
  id: string;
  slug: string;
  name: string;
  type: 'PERSONAL' | 'TEAM';
  active: boolean;
}

/**
 * Declaring the constants
 *
 * Every `/api/auth/*` call now travels through a TanStack Start server function whose handler goes
 * through `serverAuthFetch` — the same session-cookie forwarding, CSRF double-submit, and `Set-Cookie`
 * relay every other backend call gets, just against the SDK's un-versioned auth surface instead of the
 * versioned API. `serverAuthFetch` has no client-abortable `signal` (the RPC is a server-function call,
 * not a direct browser fetch), so these query functions no longer accept one.
 */

const sessionKeys = {
  session: ['session'],
  organisations: ['session', 'organisations'],
} as const;

const fetchSession = createServerFn({ method: 'GET' }).handler(() => serverAuthFetch<SessionResponse>({ method: 'GET', path: '/session' }));
const requestLogout = createServerFn({ method: 'POST' }).handler(() => serverAuthFetch<{ success: boolean }>({ method: 'POST', path: '/logout' }));
const fetchOrganisations = createServerFn({ method: 'GET' }).handler(() => serverAuthFetch<{ organisations: OrganisationResponse[] }>({ method: 'GET', path: '/organisations' }));
const requestSwitchOrganisation = createServerFn({ method: 'POST' })
  .validator((organisationId: string) => organisationId)
  .handler(({ data }) => serverAuthFetch<{ organisationId: string }>({ method: 'POST', path: '/organisation', body: { organisationId: data } }));

export function sessionQueryOptions(): EnsureQueryDataOptions<SessionResponse, ApiError> {
  return {
    queryKey: sessionKeys.session,
    queryFn: () => call(fetchSession()),
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
  return call(requestLogout());
}

/**
 * The organisations this operator may act in. Pulse is INTERNAL, so in practice this is the platform
 * organisation alone — the switcher exists for the day that stops being true and renders nothing
 * until then.
 */
export function organisationsQueryOptions(): UseQueryOptions<OrganisationResponse[], ApiError> {
  return {
    queryKey: sessionKeys.organisations,
    queryFn: () => call(fetchOrganisations()).then(body => body.organisations),
    retry: false,
  };
}

/**
 * Switches the organisation this session acts in. Identity rotates the session handle, so the reply
 * carries a replacement cookie and the handle the browser held a moment ago is dead — which is
 * precisely what stops a token minted for the previous organisation from outliving the switch.
 */
export function switchOrganisation(organisationId: string): Promise<{ organisationId: string }> {
  return call(requestSwitchOrganisation({ data: organisationId }));
}
