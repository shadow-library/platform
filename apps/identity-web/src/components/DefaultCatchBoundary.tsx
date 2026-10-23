import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { Button, cn } from '@shadow-library/ui';

import { ShieldAlertIcon } from '@/components/icons';
import { isApiError } from '@/lib/apis';

import styles from './boundary.module.css';

/** `ApiError` messages are curated for users; anything else collapses to a generic sentence so internal details never reach the page. */
export function DefaultCatchBoundary({ error, reset }: ErrorComponentProps): React.JSX.Element {
  const router = useRouter();
  /** `isApiError` instead of `instanceof`: the SSR and client bundles each carry their own `ApiError` class. */
  const sessionExpired = isApiError(error) && error.status === 401;
  const message = isApiError(error) ? error.message : 'Something went wrong on our end. Please try again.';

  if (sessionExpired) {
    return (
      <div className={cn(styles.wrap, 'min-h-screen')}>
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
    <div className={cn(styles.wrap, 'min-h-screen')}>
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
