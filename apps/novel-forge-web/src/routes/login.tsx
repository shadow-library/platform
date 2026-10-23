import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Spinner } from '@shadow-library/ui';

interface LoginSearch {
  returnTo: string;
}

/** The only public route: a shim that hands the browser to the backend's `/api/auth/login?return_to=` with a full-page load, so client-side navigations to it escape the SPA. */
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
    <main className="stack items-center justify-center gap-12 h-screen">
      <Spinner size="lg" />
      <p>Redirecting to sign-in…</p>
    </main>
  );
}
