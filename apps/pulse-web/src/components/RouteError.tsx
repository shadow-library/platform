/**
 * Importing npm packages
 */
import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { AccessDenied, EmptyState } from '@shadow-library/ui';
import { isApiError } from '@shadow-library/web';
import { isAccessDeniedError } from '@shadow-library/web/router';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The router's last resort for anything a route throws.
 *
 * A 403 gets its own face because it is not a failure the user can retry their way out of. Note the
 * copy speaks of *permission*, not of access to Pulse: reaching this screen means the operator is
 * already inside the application, and only lacks the role that covers this area. Application access
 * is refused earlier and elsewhere — identity turns those users away at sign-in, so they never load
 * this bundle at all.
 */
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
