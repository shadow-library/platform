import { Handler } from '@shadow-library/app';

export interface ApiKeyRouteMetadata {
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
export const ApiKeyAuthenticated = (): ClassDecorator & MethodDecorator => Handler({ [API_KEY_ROUTE_METADATA]: { authenticated: true } satisfies ApiKeyRouteMetadata });
