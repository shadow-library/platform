/**
 * Importing npm packages
 */
import { type ComponentType, type ReactElement, useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface RouteDefinition {
  path: string;
  component: ComponentType;
}

/**
 * Declaring the constants
 *
 * Six fixed, top-level pages don't justify a router dependency: a pathname switch with
 * history-API navigation covers everything the IdP serves.
 */

export function navigate(to: string): void {
  window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Matches a pathname against the route table; exact matches only, trailing slash tolerated. */
export function matchRoute(routes: RouteDefinition[], pathname: string): RouteDefinition | undefined {
  const clean = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return routes.find(route => route.path === clean);
}

export function Router({ routes, fallback: Fallback }: { routes: RouteDefinition[]; fallback: ComponentType }): ReactElement {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const match = matchRoute(routes, pathname);
  const Component = match?.component ?? Fallback;
  return <Component />;
}
