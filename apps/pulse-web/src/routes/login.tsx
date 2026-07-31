/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement, useEffect } from 'react';
import { Spinner } from '@shadow-library/ui';

/**
 *  Importing user defined modules
 */

/**
 * Defining types
 */
interface LoginSearch {
  returnTo: string;
}

/**
 * Declaring the constants
 */

/**
 * The bounce target of the session gate: `requireSession` lands here with the intended destination in
 * `returnTo`, and this route hands the browser to the server's OIDC login, which returns the user to
 * `returnTo` once the flow completes. A document navigation (not a router one) is required because the
 * login endpoint lives on pulse-server, outside this app — so the redirect runs client-side, in an
 * effect, rather than from `beforeLoad`: `beforeLoad` now runs on the SSR server too (no `window` there),
 * and a client-side navigation still needs a real route to land on before escaping to the backend.
 */
export const Route = createFileRoute('/login')({
  /** Constrain returnTo to a same-origin path (reject `//host` and `\host`) before it reaches the redirect. */
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const raw = typeof search.returnTo === 'string' ? search.returnTo : '/';
    const safe = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/';
    return { returnTo: safe };
  },
  head: () => ({ meta: [{ title: 'Signing in · Shadow Pulse' }] }),
  component: LoginRedirect,
});

function LoginRedirect(): ReactElement {
  const { returnTo } = Route.useSearch();

  /** The SDK login route reads `return_to` (snake_case); this app keeps `returnTo` for its own search param. */
  useEffect(() => {
    window.location.replace(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`);
  }, [returnTo]);

  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100dvh' }}>
      <Spinner aria-label="Redirecting to sign-in" />
    </div>
  );
}
