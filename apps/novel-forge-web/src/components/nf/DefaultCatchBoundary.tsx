import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { EmptyState } from '@shadow-library/ui';

import styles from './NotFound.module.css';

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
