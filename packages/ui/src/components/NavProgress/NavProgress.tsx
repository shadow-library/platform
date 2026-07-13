/**
 * Importing npm packages
 */
import { useRouterState } from '@tanstack/react-router';
import { type ReactElement } from 'react';

/**
 * Importing user defined packages
 */
import styles from './NavProgress.module.css';

/**
 * Declaring the constants
 */

/**
 * A thin, non-blocking progress bar pinned to the top of the viewport that reflects the router's real
 * pending state. The current screen stays fully interactive during a navigation, and the bar is decorative
 * (`aria-hidden`) so it never spams assistive tech — the destination content announces itself. Render it
 * once near the app root. Requires a TanStack Router context, so it ships from `@shadow-library/ui/router`.
 */
export function NavProgress(): ReactElement {
  const isNavigating = useRouterState({ select: state => state.isLoading });
  return <div className={styles.bar} data-active={isNavigating || undefined} aria-hidden='true' />;
}
