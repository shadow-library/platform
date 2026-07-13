/**
 * Importing npm packages
 */
import { EmptyState } from '@shadow-library/ui';
import { useNavigate } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import styles from './NotFound.module.css';

/**
 * Declaring the constants
 */

/**
 * The shared 404 panel. It renders bare (no app chrome) so it slots into whichever outlet raised the
 * not-found — inside the workspace shell for a deep miss, or on its own for an unknown novel. The root
 * route wraps this in the shell for unknown top-level paths.
 */
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
