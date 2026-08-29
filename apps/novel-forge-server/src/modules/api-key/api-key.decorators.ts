import { Handler } from '@shadow-library/app';

export interface ApiKeyAuthenticatedOptions {
  /**
   * Skips the guard's re-check that the key's owner still holds `novel-forge:curate`. Reserved for the
   * routes whose whole purpose is retiring the presented credential: an owner who lost the permission
   * would otherwise be unable to retire the key that outlived it, leaving a live secret nobody can
   * revoke without a curator. Possession of the secret is the only entitlement such a route consumes.
   */
  skipOwnerCheck?: boolean;
}

export interface ApiKeyRouteMetadata extends ApiKeyAuthenticatedOptions {
  authenticated: true;
}

/**
 * Forge-local route metadata key. Deliberately not the auth package's `AUTH_ROUTE_METADATA`: the two
 * guards must stay independently addressable, so a route can never accidentally opt into bearer auth
 * by asking for API-key auth.
 */
export const API_KEY_ROUTE_METADATA = 'novelForgeApiKey';

export const API_KEY_HEADER = 'x-api-key';

/** Authenticates the route from an `x-api-key` header instead of an identity credential */
export const ApiKeyAuthenticated = (options: ApiKeyAuthenticatedOptions = {}): ClassDecorator & MethodDecorator =>
  Handler({ [API_KEY_ROUTE_METADATA]: { authenticated: true, ...options } satisfies ApiKeyRouteMetadata });
