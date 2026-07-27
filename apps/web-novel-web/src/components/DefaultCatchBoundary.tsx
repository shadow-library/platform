/**
 * Importing npm packages
 */
import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { Button } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { AlertIcon } from '@/components/icons';
import { isApiError } from '@/lib/apis';

import styles from './boundary.module.css';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The router's `defaultErrorComponent`. `ApiError` messages are curated for users; anything else collapses
 * to a generic sentence so stack traces never reach the page. Retry re-runs the failed loaders.
 */
export function DefaultCatchBoundary({ error, reset }: ErrorComponentProps): React.JSX.Element {
  const router = useRouter();
  const message = isApiError(error) ? error.message : 'Something went wrong on our end. Please try again.';

  return (
    <div className={styles.wrap}>
      <div className={`${styles.mark} ${styles.markDanger}`}>
        <AlertIcon size={26} />
      </div>
      <h1 className={styles.title}>Something went wrong</h1>
      <p className={styles.text}>{message}</p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Try again
        </Button>
        <Button variant="secondary" asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
