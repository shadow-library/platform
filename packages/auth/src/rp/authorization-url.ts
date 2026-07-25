/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface AuthorizationUrlInput {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  nonce: string;
  /** The RFC 7636 S256 challenge; the matching verifier stays server-side until the callback */
  codeChallenge: string;

  /** The API resource the resulting token should be addressed to; a scope is only minted for the resource that owns it */
  resource?: string;

  /** RFC 9470 step-up: the assurance level the authorization must reach before it returns */
  acrValues?: string[];
}

/**
 * Declaring the constants
 *
 * Shared by both flows so a third-party relying party and a first-party app session cannot drift
 * apart on what an authorization request looks like — only what they redeem the code for differs.
 */

export function buildAuthorizationUrl(input: AuthorizationUrlInput): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', input.scopes.join(' '));
  url.searchParams.set('state', input.state);
  url.searchParams.set('nonce', input.nonce);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (input.resource) url.searchParams.set('resource', input.resource);
  if (input.acrValues?.length) url.searchParams.set('acr_values', input.acrValues.join(' '));
  return url.toString();
}
