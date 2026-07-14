/**
 * Importing npm packages
 */
import { Button } from '@shadow-library/ui';
import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { ShieldAlertIcon } from '@/components/icons';
import { ApiError } from '@/lib/apis';

import styles from './boundary.module.css';

/**
 * Declaring the constants
 *
 * The router's `defaultErrorComponent`. It surfaces a safe message — `ApiError` messages are curated for
 * users, anything else collapses to a generic sentence so stack traces / internal details never reach the
 * page — and offers retry (re-runs the failed loaders) plus an escape hatch. A 401 that escaped the route
 * guards means the session lapsed mid-view, so it points at sign-in instead of a pointless retry.
 */
export function DefaultCatchBoundary({ error, reset }: ErrorComponentProps): React.JSX.Element {
  const router = useRouter();
  const sessionExpired = error instanceof ApiError && error.status === 401;
  const message = error instanceof ApiError ? error.message : 'Something went wrong on our end. Please try again.';

  if (sessionExpired) {
    return (
      <div className={styles.wrap}>
        <div className={`${styles.mark} ${styles.markDanger}`}>
          <ShieldAlertIcon size={26} />
        </div>
        <h1 className={styles.title}>Your session expired</h1>
        <p className={styles.text}>Sign in again to pick up where you left off.</p>
        <Button variant="primary" asChild>
          <Link to="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={`${styles.mark} ${styles.markDanger}`}>
        <ShieldAlertIcon size={26} />
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
          <Link to="/account">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
