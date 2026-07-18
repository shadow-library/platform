/**
 * Importing npm packages
 */
import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { EmptyState } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import styles from './NotFound.module.css';

/**
 * Declaring the constants
 */

/**
 * The default route error boundary. Rendered in the failing route's outlet (so it stays inside the app
 * shell for a leaf-screen error), it shows the message without leaking a stack trace and offers a retry
 * that re-runs the route's loaders via `router.invalidate()`.
 */
export function DefaultCatchBoundary({ error, reset }: ErrorComponentProps): React.JSX.Element {
  const router = useRouter();
  const retry = (): void => {
    reset();
    void router.invalidate();
  };
  return (
    <div className={styles.wrap}>
      <EmptyState
        size="page"
        title="Something went wrong"
        description={error?.message ?? 'An unexpected error occurred. Please try again.'}
        action={{ label: 'Try again', onClick: retry }}
      />
    </div>
  );
}
