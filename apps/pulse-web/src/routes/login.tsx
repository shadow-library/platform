import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement, useEffect } from 'react';
import { Spinner } from '@shadow-library/ui';

interface LoginSearch {
  returnTo: string;
}

// The login endpoint lives on pulse-server, so this is a document navigation; it runs in an effect because beforeLoad also runs on the SSR server (no `window`).
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
    <div className="center h-screen">
      <Spinner aria-label="Redirecting to sign-in" />
    </div>
  );
}
