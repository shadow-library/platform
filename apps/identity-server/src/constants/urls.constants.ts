const trimTrailingSlash = (domain: string): string => domain.replace(/\/+$/, '');

export const oidcDiscoveryUrl = (domain: string): string => `${trimTrailingSlash(domain)}/.well-known/openid-configuration`;

/** Have I Been Pwned k-anonymity range URL; `prefix` is the first five SHA-1 hex characters. */
export const hibpRangeUrl = (prefix: string): string => `https://api.pwnedpasswords.com/range/${prefix}`;
