import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Spinner } from '@shadow-library/ui';

interface LoginSearch {
  returnTo: string;
}

/**
 * The only public route. There is no local sign-in UI — the backend's relying-party auth module owns the
 * OIDC flow — so this shim immediately hands the browser to `/api/auth/login?return_to=` with a full-page
 * load. It exists (rather than `requireAuth` redirecting straight to the backend path) so client-side
 * navigations land on a real route and escape the SPA cleanly.
 */
export const Route = createFileRoute('/login')({
  /** Constrain returnTo to a same-origin path (reject `//host` and `/\host`) before it reaches the redirect. */
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const raw = typeof search.returnTo === 'string' ? search.returnTo : '/';
    const safe = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/';
    return { returnTo: safe };
  },
  head: () => ({ meta: [{ title: 'Signing in · Novel Forge' }] }),
  component: LoginRedirect,
});

function LoginRedirect(): React.JSX.Element {
  const { returnTo } = Route.useSearch();

  useEffect(() => {
    window.location.replace(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`);
  }, [returnTo]);

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Spinner size="lg" />
      <p>Redirecting to sign-in…</p>
    </main>
  );
}
