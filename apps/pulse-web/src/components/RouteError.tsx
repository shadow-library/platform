import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { AccessDenied, EmptyState } from '@shadow-library/ui';
import { isApiError } from '@shadow-library/web';
import { isAccessDeniedError } from '@shadow-library/web/router';

// A 403 means a signed-in operator lacking the role (identity refuses application access at sign-in), so the copy speaks of permission, not access to Pulse.
export default function RouteError({ error, reset }: ErrorComponentProps): ReactElement {
  const router = useRouter();
  const code = isApiError(error) ? error.code : undefined;

  if (isAccessDeniedError(error)) {
    return (
      <AccessDenied
        title="You don’t have permission to view this"
        description="Your role doesn’t cover this area of Pulse. Ask a Pulse administrator to grant it."
        error={code}
        action={{ label: 'Back to dashboard', onClick: () => void router.navigate({ to: '/' }) }}
      />
    );
  }

  return (
    <EmptyState
      title="Something went wrong"
      description={error instanceof Error ? error.message : 'The page could not be loaded.'}
      action={{ label: 'Try again', onClick: () => reset() }}
      secondaryAction={{ label: 'Back to dashboard', onClick: () => void router.navigate({ to: '/' }) }}
    />
  );
}
