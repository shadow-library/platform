import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement, useEffect } from 'react';
import { Spinner } from '@shadow-library/ui';

import { loginUrl } from '@/lib/apis';

interface LoginSearch {
  returnTo: string;
}

/**
 * The only public route. There is no local sign-in UI — the backend's relying-party auth module owns the OIDC
 * flow — so this shim immediately hands the browser to its login route with a full-page load. It exists
 * (rather than `requireAuth` redirecting straight to the backend path) so client-side navigations land on a
 * real route and escape the SPA cleanly.
 */
export const Route = createFileRoute('/login')({
  /** Constrain returnTo to a same-origin path (reject `//host` and `\host`) before it reaches the redirect. */
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const raw = typeof search.returnTo === 'string' ? search.returnTo : '/';
    const safe = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/';
    return { returnTo: safe };
  },
  head: () => ({ meta: [{ title: 'Signing in · Shadow Memoir' }] }),
  component: LoginRedirect,
});

function LoginRedirect(): ReactElement {
  const { returnTo } = Route.useSearch();

  useEffect(() => {
    window.location.replace(loginUrl(returnTo));
  }, [returnTo]);

  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100dvh' }}>
      <Spinner aria-label="Redirecting to sign-in" />
    </div>
  );
}
