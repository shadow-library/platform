/**
 * A browser folds backslashes into slashes, so the candidate is normalised before the protocol-relative
 * (`//host`) check. A relative same-origin path is always safe; an absolute URL is allowed only for the
 * current origin or a first-party app under the ecosystem root domain — never an arbitrary origin.
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
