import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { AccessDenied, EmptyState } from '@shadow-library/ui';
import { isApiError } from '@shadow-library/web';
import { isAccessDeniedError } from '@shadow-library/web/router';

/**
 * The router's last resort for anything a route throws. A 403 gets its own face because it is not a failure
 * the owner can retry their way out of — in a single-user product it means an entitlement, not a role.
 */
export default function RouteError({ error, reset }: ErrorComponentProps): ReactElement {
  const router = useRouter();
  const code = isApiError(error) ? error.code : undefined;

  if (isAccessDeniedError(error)) {
    return (
      <AccessDenied
        title="This part of Shadow Memoir isn't available on your account"
        description="Your membership doesn't currently include it. Nothing you have logged is affected."
        error={code}
        action={{ label: 'Back to today', onClick: () => void router.navigate({ to: '/' }) }}
      />
    );
  }

  return (
    <EmptyState
      title="Something went wrong"
      description={error instanceof Error ? error.message : 'The page could not be loaded.'}
      action={{ label: 'Try again', onClick: () => reset() }}
      secondaryAction={{ label: 'Back to today', onClick: () => void router.navigate({ to: '/' }) }}
    />
  );
}
