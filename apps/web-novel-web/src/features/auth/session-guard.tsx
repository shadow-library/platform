import { Spinner } from '@shadow-library/ui';
import { type AuthAccessMode } from '@shadow-library/web/auth';

import { useReaderSessionGuard } from '@/lib/apis';

import styles from './session-guard.module.css';

export interface SessionGuardProps {
  accessMode: AuthAccessMode;
  children: React.ReactNode;
}

/** Withholds the screen while an ended session bounces to sign-in, so a private deployment never keeps rendering it. */
export function SessionGuard({ accessMode, children }: SessionGuardProps): React.JSX.Element {
  const status = useReaderSessionGuard(accessMode);
  if (status === 'redirecting')
    return (
      <div className={styles.redirecting}>
        <Spinner aria-label="Redirecting to sign-in" />
      </div>
    );
  return <>{children}</>;
}
