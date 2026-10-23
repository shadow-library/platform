/** Audience used when an authorization request names no resource: identity's own platform API. */
export const DEFAULT_AUDIENCE = 'shadow-identity';

export const applicationAudience = (application: string): string => `api://${application}`;

/** Callback path served by every first-party relying party. */
export const OAUTH_CALLBACK_PATH = '/api/auth/callback';

/** RFC 8693 grant and token-type identifiers for delegated user context across applications. */
export const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

/** Subject token type for exchanging an organisation bot key through the same RFC 8693 grant. */
export const BOT_KEY_TOKEN_TYPE = 'urn:shadow:token-type:bot-key';
