/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Every outbound URL the identity service calls, in one place. Internal ecosystem calls use the
 * `svc://<service>/<path>` scheme, which APIRequest resolves through cluster DNS (or a
 * `SERVICE_URL_<NAME>` override); external calls are absolute. Path parameters are string-interpolated.
 */

const trimTrailingSlash = (domain: string): string => domain.replace(/\/+$/, '');

/** pulse-server notification API — the identity service owns no transport and delegates delivery here. */
export const PULSE_NOTIFICATION_URL = 'svc://pulse-server/api/v1/notifications';

/** Standard OIDC discovery document for an issuer domain (workload identity + upstream federation). */
export const oidcDiscoveryUrl = (domain: string): string => `${trimTrailingSlash(domain)}/.well-known/openid-configuration`;

/** Have I Been Pwned k-anonymity range API (external); `prefix` is the first five SHA-1 hex characters. */
export const hibpRangeUrl = (prefix: string): string => `https://api.pwnedpasswords.com/range/${prefix}`;
