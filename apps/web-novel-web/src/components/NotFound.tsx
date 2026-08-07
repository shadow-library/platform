import { Link } from '@tanstack/react-router';
import { Button } from '@shadow-library/ui';

import styles from './boundary.module.css';

/**
 * The 404 surface from the mockups ("Lost in the shadows") — plain content, so it renders inside whichever
 * layout is already mounted.
 */
export function NotFound(): React.JSX.Element {
  return (
    <div className={styles.wrap}>
      <div className={styles.code}>404</div>
      <h1 className={styles.title}>Lost in the shadows</h1>
      <p className={styles.text}>We couldn’t find that page. Let’s get you back to something worth reading.</p>
      <div className={styles.actions}>
        <Button variant="primary" asChild>
          <Link to="/">Back to home</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link to="/browse">Search novels</Link>
        </Button>
      </div>
    </div>
  );
}
