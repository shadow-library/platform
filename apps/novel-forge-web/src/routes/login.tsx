/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Spinner } from '@shadow-library/ui';

/**
 * Importing user defined modules
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
 * The only public route. There is no local sign-in UI — the backend's relying-party auth module owns the
 * OIDC flow — so this shim immediately hands the browser to `/api/auth/login?returnTo=` with a full-page
 * load. It exists (rather than `requireAuth` redirecting straight to the backend path) so client-side
 * navigations land on a real route and escape the SPA cleanly.
 */
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({ returnTo: typeof search.returnTo === 'string' ? search.returnTo : '/' }),
  head: () => ({ meta: [{ title: 'Signing in · Novel Forge' }] }),
  component: LoginRedirect,
});

function LoginRedirect(): React.JSX.Element {
  const { returnTo } = Route.useSearch();

  useEffect(() => {
    window.location.replace(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [returnTo]);

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Spinner size="lg" />
      <p>Redirecting to sign-in…</p>
    </main>
  );
}
