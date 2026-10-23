import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement, useEffect, useState } from 'react';
import { Button } from '@shadow-library/ui';

import { StatusPage } from '@/components/StatusPage';
import { loginUrl } from '@/lib/apis';
import { safeReturnTo } from '@/lib/return-to';

interface LoginSearch {
  returnTo: string;
}

const STALLED_AFTER_MS = 3_000;

/**
 * The only public route. The backend's relying-party auth module owns the OIDC flow, so this shim hands the browser to its login route with a full-page
 * load and escapes the SPA cleanly.
 */
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({ returnTo: safeReturnTo(search.returnTo) }),
  staticData: { title: 'Signing in' },
  component: LoginRedirect,
});

function LoginRedirect(): ReactElement {
  const { returnTo } = Route.useSearch();
  const [stalled, setStalled] = useState(false);
  const href = loginUrl(returnTo);

  useEffect(() => {
    window.location.replace(href);
    const timer = setTimeout(() => setStalled(true), STALLED_AFTER_MS);
    return () => clearTimeout(timer);
  }, [href]);

  return (
    <StatusPage
      title="Redirecting to sign-in…"
      description={stalled ? 'This is taking longer than usual. You can continue to the sign-in page yourself.' : 'One moment while the sign-in page opens.'}
      pending
      actions={
        stalled ? (
          <Button variant="primary" asChild>
            <a href={href}>Continue to sign-in</a>
          </Button>
        ) : undefined
      }
    />
  );
}
