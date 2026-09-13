const FALLBACK = '/';
const LOGIN_PATH = '/login';
const RESOLUTION_BASE = new URL('https://return-to.invalid');

function withoutControls(value: string): string {
  let result = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code > 0x1f && code !== 0x7f) result += char;
  }
  return result;
}

function decodeOnce(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Browsers drop tab/newline/CR anywhere in a URL, trim surrounding spaces and read `\` as `/`, so `/\t/host` and `\/host`
 * both reach another origin; resolving dot segments turns `/.//host` into `//host`, so the parsed path is checked too.
 */
function sameOriginPath(value: string): URL | null {
  const compact = withoutControls(value).replace(/\s/g, '').replace(/\\/g, '/');
  if (!compact.startsWith('/') || compact.startsWith('//')) return null;
  let url: URL;
  try {
    url = new URL(withoutControls(value).trim(), RESOLUTION_BASE);
  } catch {
    return null;
  }
  if (url.origin !== RESOLUTION_BASE.origin || url.pathname.startsWith('//')) return null;
  return url;
}

function isLoginPath(url: URL): boolean {
  return url.pathname.replace(/\/+$/, '').toLowerCase() === LOGIN_PATH;
}

/**
 * Reduces a `returnTo` candidate to a same-origin path, query and hash, or `/`. Both the candidate and the result are also
 * checked once percent-decoded, because the result passes through another redirect (`return_to`) that may decode it again.
 * `/login` is refused in any case — the router matches it that way — so signing in never lands back on the redirect shim.
 */
export function safeReturnTo(candidate: unknown): string {
  if (typeof candidate !== 'string') return FALLBACK;
  const url = sameOriginPath(candidate);
  if (!url || isLoginPath(url)) return FALLBACK;

  const target = `${url.pathname}${url.search}${url.hash}`;
  for (const form of [decodeOnce(candidate), decodeOnce(target)]) {
    const decoded = form === null ? null : sameOriginPath(form);
    if (!decoded || isLoginPath(decoded)) return FALLBACK;
  }
  return target;
}
