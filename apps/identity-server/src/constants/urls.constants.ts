const trimTrailingSlash = (domain: string): string => domain.replace(/\/+$/, '');

/** Pulse notification endpoint resolved through the internal `svc://` transport. */
export const PULSE_NOTIFICATION_URL = 'svc://pulse-server/api/v1/notifications';

/** Standard OIDC discovery-document URL for an issuer domain. */
export const oidcDiscoveryUrl = (domain: string): string => `${trimTrailingSlash(domain)}/.well-known/openid-configuration`;

/** Have I Been Pwned k-anonymity range URL; `prefix` is the first five SHA-1 hex characters. */
export const hibpRangeUrl = (prefix: string): string => `https://api.pwnedpasswords.com/range/${prefix}`;
