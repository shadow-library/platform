import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement, useEffect } from 'react';
import { Spinner } from '@shadow-library/ui';

import { loginUrl } from '@/lib';

interface LoginSearch {
  returnTo: string;
}

/** The login endpoint lives on synapse-server, so leaving for it is a document navigation, which only the browser can make. */
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const raw = typeof search.returnTo === 'string' ? search.returnTo : '/';
    const safe = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/';
    return { returnTo: safe };
  },
  head: () => ({ meta: [{ title: 'Signing in · Shadow Synapse' }] }),
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
