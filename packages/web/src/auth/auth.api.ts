import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import { type ApiSurface } from '../lib/api-client';
import { ApiError } from '../lib/api-error';
import { type AuthAccess, type AuthLogoutResult, type AuthOrganisation, type AuthPrincipal, type AuthSwitchOrganisationResult } from './auth.types';

export interface AuthApiOptions {
  /** Prefix for the query keys, so an app can nest them under its own namespace. @default ['auth'] */
  keyPrefix?: readonly string[];
  /**
   * How long a resolved session is treated as fresh; `0` re-validates on every mount.
   * @default 0
   */
  staleTime?: number;
}

export interface AuthApi {
  keys: {
    session: readonly string[];
    optionalSession: readonly string[];
    organisations: readonly string[];
    access: readonly string[];
  };
  /** The signed-in principal. A 401 throws, which is what a route gate reads to bounce to login. */
  sessionQueryOptions(): UseQueryOptions<AuthPrincipal, ApiError>;
  /**
   * The signed-in principal, or `null` when signed out, for apps where guest browsing is valid.
   * Apps that reshape the principal cannot do so with `select` (`requireAuth` uses `ensureQueryData`, which ignores it);
   * they should wrap `surface.get('/session').result<AuthPrincipal>()` in their own `queryOptions` and map inside the `queryFn`.
   */
  optionalSessionQueryOptions(): UseQueryOptions<AuthPrincipal | null, ApiError>;
  /** The organisations this session may act in; one entry means there is nothing to switch to. */
  organisationsQueryOptions(): UseQueryOptions<AuthOrganisation[], ApiError>;
  /**
   * Whether the backend lets a guest browse (`public`) or demands a session everywhere (`private`). Fixed at deploy time, so it is never
   * re-validated or garbage-collected (an offline re-read would fail closed) and never retried.
   */
  accessQueryOptions(): UseQueryOptions<AuthAccess, ApiError>;
  /** Ends this application's session. The central identity session survives it unless the backend answers with `redirectTo`. */
  logout(): Promise<AuthLogoutResult>;
  /** Switches the organisation this session acts in. Identity rotates the session handle, so the reply carries a replacement cookie. */
  switchOrganisation(organisationId: string): Promise<AuthSwitchOrganisationResult>;
  /** The full-page login redirect. A navigation target, never a fetch — it bounces through the identity provider. */
  loginUrl(returnTo?: string): string;
}

const DEFAULT_KEY_PREFIX = ['auth'] as const;

/** Binds the SDK's browser auth endpoints to an app's `/api/auth` surface. Queries never retry: a 401 means signed out and a retry only delays the route gate's redirect. */
export function createAuthApi(surface: ApiSurface, options: AuthApiOptions = {}): AuthApi {
  const prefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
  const staleTime = options.staleTime ?? 0;

  const keys = {
    session: [...prefix, 'session'] as const,
    optionalSession: [...prefix, 'session', 'optional'] as const,
    organisations: [...prefix, 'organisations'] as const,
    access: [...prefix, 'access'] as const,
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
          // A 401 means signed out and folds into `null`; every other failure throws.
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

    accessQueryOptions: () =>
      queryOptions<AuthAccess, ApiError>({
        queryKey: keys.access,
        queryFn: ({ signal }) => surface.get('/access').signal(signal).execute<AuthAccess>(),
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
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
