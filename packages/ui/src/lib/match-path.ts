export interface MatchPathOptions {
  exact?: boolean;
}

/** Drops the query, the hash and any trailing slash so `/a/`, `/a?x=1` and `/a` compare equal. */
function normalize(path: string): string {
  const bare = path.split(/[?#]/, 1)[0] ?? '';
  return bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare;
}

/**
 * Segment-aware prefix test: `/librarything` is not `/library`. A `to` of `'/'` is always exact.
 * Prefer a router link's own active state (`data-status="active"`); use this when a parent needs to know which child is current.
 */
export function matchPath(pathname: string, to: string, options: MatchPathOptions = {}): boolean {
  const current = normalize(pathname);
  const target = normalize(to);
  if (options.exact === true || target === '/' || target === '') return current === target;
  return current === target || current.startsWith(`${target}/`);
}
