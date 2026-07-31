/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface MatchPathOptions {
  /** Match the destination only, never its descendants. Always true for the root path. @default false */
  exact?: boolean;
}

/**
 * Declaring the constants
 */
/** Drops the query, the hash and any trailing slash so `/a/`, `/a?x=1` and `/a` compare equal. */
function normalize(path: string): string {
  const bare = path.split(/[?#]/, 1)[0] ?? '';
  return bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare;
}

/**
 * Whether a destination is the current one — the segment-aware prefix test every navigation needs, so
 * products stop re-deriving it per sidebar. A naive `pathname.startsWith(to)` reports `/librarything`
 * as `/library`; this only matches on a segment boundary.
 *
 * `to` of `'/'` is always exact, since every path is prefixed by the root.
 *
 * Prefer a router link's own active state where there is one (Sidebar.Item and TopNavigation.Item both
 * key off `data-status="active"`). Reach for this when a *parent* has to know which child is current —
 * a bottom bar's `value`, or an overflow menu deciding whether it holds the active destination.
 */
export function matchPath(pathname: string, to: string, options: MatchPathOptions = {}): boolean {
  const current = normalize(pathname);
  const target = normalize(to);
  if (options.exact === true || target === '/' || target === '') return current === target;
  return current === target || current.startsWith(`${target}/`);
}
