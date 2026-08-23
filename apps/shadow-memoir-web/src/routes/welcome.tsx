import { createFileRoute } from '@tanstack/react-router';

import { LandingScreen } from '@/features/landing';

interface WelcomeSearch {
  returnTo: string;
}

/**
 * The signed-out landing state and the bounce target of the session gate: `requireSession` lands here with
 * the intended destination in `returnTo`, and the screen hands the browser to the backend's OIDC login.
 */
export const Route = createFileRoute('/welcome')({
  /** Constrain returnTo to a same-origin path (reject `//host` and `\host`) before it reaches the redirect. */
  validateSearch: (search: Record<string, unknown>): WelcomeSearch => {
    const raw = typeof search.returnTo === 'string' ? search.returnTo : '/';
    const safe = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/';
    return { returnTo: safe };
  },
  head: () => ({ meta: [{ title: 'Shadow Memoir' }] }),
  component: Welcome,
});

function Welcome(): React.JSX.Element {
  const { returnTo } = Route.useSearch();
  return <LandingScreen returnTo={returnTo} />;
}
