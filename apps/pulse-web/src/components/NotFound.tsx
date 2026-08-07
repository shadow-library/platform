import { useRouter } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { EmptyState } from '@shadow-library/ui';

/**
 * The shared not-found surface — used as both the router's `defaultNotFoundComponent` (any unmatched
 * route) and the root route's own `notFoundComponent` (a path that matches nothing in the tree at all).
 * Root's own `component` still renders normally for this case (root itself always matches), so this
 * needs no document shell of its own — it renders as the Outlet's content, same as any other route.
 */
export default function NotFound(): ReactElement {
  const router = useRouter();
  return (
    <EmptyState
      title="Page not found"
      description="That page doesn't exist or has moved."
      action={{ label: 'Back to dashboard', onClick: () => void router.navigate({ to: '/' }) }}
    />
  );
}
