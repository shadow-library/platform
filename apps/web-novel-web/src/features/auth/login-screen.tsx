import { getRouteApi, useRouter } from '@tanstack/react-router';
import { Button } from '@shadow-library/ui';

import { LockIcon } from '@/components/icons';
import { loginUrl } from '@/lib/apis';

import styles from './login-screen.module.css';

const route = getRouteApi('/login');

export function LoginScreen(): React.JSX.Element {
  const search = route.useSearch();
  const router = useRouter();
  const returnTo = search.returnTo ?? '/';

  return (
    <div className={`${styles.wrap} wn-fade`}>
      <div className={styles.card}>
        <div className={styles.mark}>
          <LockIcon size={24} />
        </div>
        <h1 className={styles.title}>Sign in to Shadow</h1>
        <p className={styles.text}>Sync your library, reading progress and downloads across every device. Reading always stays free — no account required.</p>
        <div className={styles.issuerNote}>
          <LockIcon size={14} />
          <span>
            You’ll sign in securely at <span className={styles.issuer}>accounts.shadow.app</span>
          </span>
        </div>
        <div className={styles.actions}>
          <Button variant="primary" size="lg" fullWidth asChild>
            <a href={loginUrl(returnTo)}>Continue to sign in →</a>
          </Button>
          <Button variant="ghost" fullWidth onClick={() => router.history.back()}>
            Not now — keep reading as guest
          </Button>
        </div>
      </div>
    </div>
  );
}
