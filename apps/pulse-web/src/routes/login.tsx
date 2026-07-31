/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Spinner } from '@shadow-library/ui';

/**
 *  Importing user defined modules
 */

/**
 * Declaring the constants
 */

/**
 * The bounce target of the session gate: `requireSession` lands here with the intended destination in
 * `returnTo`, and this route hands the browser to the server's OIDC login, which returns the user to
 * `returnTo` once the flow completes. A document navigation (not a router one) is required because the
 * login endpoint lives on pulse-server, outside the SPA.
 */
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({ returnTo: typeof search.returnTo === 'string' && search.returnTo.startsWith('/') ? search.returnTo : '/' }),
  /** The SDK login route reads `return_to` (snake_case); the SPA keeps `returnTo` for its own search param */
  beforeLoad: ({ search }) => window.location.replace(`/api/auth/login?return_to=${encodeURIComponent(search.returnTo)}`),
  component: LoginRedirect,
});

function LoginRedirect(): ReactElement {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100dvh' }}>
      <Spinner aria-label="Redirecting to sign-in" />
    </div>
  );
}
