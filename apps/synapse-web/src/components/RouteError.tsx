import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { AccessDenied, EmptyState } from '@shadow-library/ui';
import { isApiError } from '@shadow-library/web';
import { isAccessDeniedError } from '@shadow-library/web/router';

export function RouteError({ error, reset }: ErrorComponentProps): ReactElement {
  const router = useRouter();
  const code = isApiError(error) ? error.code : undefined;

  if (isAccessDeniedError(error)) {
    return (
      <AccessDenied
        title="You don’t have permission to view this"
        description="Your role doesn’t cover this area of Synapse. Ask a Synapse administrator to grant it."
        error={code}
        action={{ label: 'Back to overview', onClick: () => void router.navigate({ to: '/' }) }}
      />
    );
  }

  return (
    <EmptyState
      title="Something went wrong"
      description={error instanceof Error ? error.message : 'The page could not be loaded.'}
      action={{ label: 'Try again', onClick: () => reset() }}
      secondaryAction={{ label: 'Back to overview', onClick: () => void router.navigate({ to: '/' }) }}
    />
  );
}
