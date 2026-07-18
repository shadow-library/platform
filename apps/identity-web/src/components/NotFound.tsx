/**
 * Importing npm packages
 */
import { Link } from '@tanstack/react-router';
import { Button } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { ShieldIcon } from '@/components/icons';

import styles from './boundary.module.css';

/**
 * Declaring the constants
 *
 * The shared not-found surface — used as the router's `defaultNotFoundComponent` and the root route's
 * `notFoundComponent`. Kept as plain content (no document shell) so it renders inside whichever layout
 * is already mounted.
 */
export function NotFound(): React.JSX.Element {
  return (
    <div className={styles.wrap}>
      <div className={styles.mark}>
        <ShieldIcon size={26} />
      </div>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.text}>That page doesn’t exist or you don’t have access to it.</p>
      <Button variant="primary" asChild>
        <Link to="/account">Go to your account</Link>
      </Button>
    </div>
  );
}
