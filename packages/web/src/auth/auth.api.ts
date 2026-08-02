/**
 * Importing npm packages
 */
import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type ApiSurface } from '../lib/api-client';
import { ApiError } from '../lib/api-error';
import { type AuthLogoutResult, type AuthOrganisation, type AuthPrincipal, type AuthSwitchOrganisationResult } from './auth.types';

/**
 * Defining types
 *
 * The client half of `@shadow-library/auth`'s browser surface. Every app that mounts the SDK gets the same
 * five endpoints, so it gets the same query options, mutations and keys from here instead of writing them
 * a fourth time — the endpoints are the SDK's, not the app's, and an app that re-declares them is one
 * backend change away from being wrong.
 */
export interface AuthApiOptions {
  /** Prefix for the query keys, so an app can nest them under its own namespace. @default ['auth'] */
  keyPrefix?: readonly string[];
  /**
   * How long a resolved session is treated as fresh. `0` re-validates on every mount, which is what a
   * console gating its whole shell on the session wants; a reader app browsing public pages can afford more.
   * @default 0
   */
  staleTime?: number;
}

export interface AuthApi {
  keys: {
    session: readonly string[];
    optionalSession: readonly string[];
    organisations: readonly string[];
  };
  /** The signed-in principal. A 401 throws, which is what a route gate reads to bounce to login. */
  sessionQueryOptions(): UseQueryOptions<AuthPrincipal, ApiError>;
  /**
   * The signed-in principal, or `null` when signed out — for apps where browsing as a guest is a valid
   * state, not a failure.
   *
   * Usable as-is only by an app whose own session type *is* `AuthPrincipal`. An app that reshapes it
   * (mapping `sub` onto its own user model, say) cannot do so with `select`, because `requireAuth` resolves
   * the query through `ensureQueryData`, which returns the unselected data and would hand the gate the
   * wrong shape. Those apps should build their own `queryOptions` around
   * `surface.get('/session').result<AuthPrincipal>()` — the one line this wraps — and map inside the
   * `queryFn`, where the result is the query's own data.
   */
  optionalSessionQueryOptions(): UseQueryOptions<AuthPrincipal | null, ApiError>;
  /** The organisations this session may act in; one entry means there is nothing to switch to. */
  organisationsQueryOptions(): UseQueryOptions<AuthOrganisation[], ApiError>;
  /** Ends this application's session. The central identity session survives it unless the backend answers with `redirectTo`. */
  logout(): Promise<AuthLogoutResult>;
  /** Switches the organisation this session acts in. Identity rotates the session handle, so the reply carries a replacement cookie. */
  switchOrganisation(organisationId: string): Promise<AuthSwitchOrganisationResult>;
  /** The full-page login redirect. A navigation target, never a fetch — it bounces through the identity provider. */
  loginUrl(returnTo?: string): string;
}

/**
 * Declaring the constants
 */
const DEFAULT_KEY_PREFIX = ['auth'] as const;

/**
 * Binds the SDK's auth surface to an app's `/api/auth` client surface.
 *
 * A session query never retries: a 401 means "not signed in", and retrying only re-confirms it while the
 * route gate waits to redirect.
 */
export function createAuthApi(surface: ApiSurface, options: AuthApiOptions = {}): AuthApi {
  const prefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
  const staleTime = options.staleTime ?? 0;

  const keys = {
    session: [...prefix, 'session'] as const,
    optionalSession: [...prefix, 'session', 'optional'] as const,
    organisations: [...prefix, 'organisations'] as const,
  };

  return {
    keys,

    sessionQueryOptions: () =>
      queryOptions<AuthPrincipal, ApiError>({
        queryKey: keys.session,
        queryFn: ({ signal }) => surface.get('/session').signal(signal).execute<AuthPrincipal>(),
        retry: false,
        staleTime,
      }),

    optionalSessionQueryOptions: () =>
      queryOptions<AuthPrincipal | null, ApiError>({
        queryKey: keys.optionalSession,
        queryFn: async ({ signal }) => {
          // A signed-out reader is a state to render, not an error to report — so the 401 the SDK answers
          // with is folded into `null` here and every other failure still surfaces as an `ApiError`.
          const result = await surface.get('/session').signal(signal).result<AuthPrincipal>();
          if (result.ok) return result.data;
          if (result.failure.status === 401) return null;
          throw new ApiError(result.failure.status, result.failure, result.failure.retryAfterSeconds);
        },
        retry: false,
        staleTime,
      }),

    organisationsQueryOptions: () =>
      queryOptions<AuthOrganisation[], ApiError>({
        queryKey: keys.organisations,
        queryFn: ({ signal }) =>
          surface
            .get('/organisations')
            .signal(signal)
            .execute<{ organisations: AuthOrganisation[] }>()
            .then(body => body.organisations),
        retry: false,
      }),

    logout: () => surface.post('/logout').execute<AuthLogoutResult>(),

    switchOrganisation: organisationId => surface.post('/organisation').body({ organisationId }).execute<AuthSwitchOrganisationResult>(),

    loginUrl: returnTo => {
      // The SDK's login route reads the RFC-spelled `return_to`; apps spell their own routes however they like.
      const path = `${surface.basePath}/login`;
      return returnTo ? `${path}?return_to=${encodeURIComponent(returnTo)}` : path;
    },
  };
}
