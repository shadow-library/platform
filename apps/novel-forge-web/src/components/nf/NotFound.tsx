import { useNavigate } from '@tanstack/react-router';
import { EmptyState } from '@shadow-library/ui';

import styles from './NotFound.module.css';

export function RouteNotFound(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <div className={styles.wrap}>
      <EmptyState
        size="page"
        title="Page not found"
        description="That page doesn’t exist, or it may have been deleted. Head back to your projects."
        action={{ label: 'Go to projects', onClick: () => navigate({ to: '/' }) }}
      />
    </div>
  );
}
