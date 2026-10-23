/**
 * Browsers fold backslashes into slashes, so the candidate is normalised before the protocol-relative (`//host`) check.
 * Absolute URLs are limited to the current origin and first-party apps under the root domain.
 */
export function safeReturnTo(candidate: string | undefined, rootDomain: string): string | null {
  if (!candidate) return null;
  const normalised = candidate.replace(/\\/g, '/');
  if (normalised.startsWith('/') && !normalised.startsWith('//')) return normalised;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.origin === window.location.origin) return url.toString();
  if (url.hostname === rootDomain || url.hostname.endsWith(`.${rootDomain}`)) return url.toString();
  return null;
}
