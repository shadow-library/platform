import { Link } from '@tanstack/react-router';
import { Button } from '@shadow-library/ui';

import { ShieldIcon } from '@/components/icons';

import styles from './boundary.module.css';

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
