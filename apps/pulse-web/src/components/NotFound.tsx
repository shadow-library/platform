import { useRouter } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { EmptyState } from '@shadow-library/ui';

// Also the root route's notFoundComponent; root always matches, so no document shell is needed.
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
