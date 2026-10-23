const CONTROL_CHARACTERS = /\p{Cc}/u;
const RESUME_PATHS = ['/oauth2/authorize', '/saml2/sso/resume'];

/** Browsers fold backslashes into slashes and strip tabs and newlines, so either could turn a `/` path into a protocol-relative `//host`. */
export function safeReturnTo(candidate: string | undefined, rootDomain: string): string | null {
  if (!candidate || CONTROL_CHARACTERS.test(candidate)) return null;
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

/** `return_to` on the login URL is attacker-craftable, so it may only resume the identity server's own authorize or SAML handoff on this origin. */
export function safeResumeUrl(candidate: string | undefined): string | null {
  if (!candidate || CONTROL_CHARACTERS.test(candidate)) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.origin !== window.location.origin || !RESUME_PATHS.includes(url.pathname)) return null;
  return url.toString();
}

export interface SignInSearch {
  returnTo?: string;
  return_to?: string;
}

export function signInTarget(search: SignInSearch, rootDomain: string): string | null {
  return safeReturnTo(safeResumeUrl(search.return_to) ?? search.returnTo, rootDomain);
}
