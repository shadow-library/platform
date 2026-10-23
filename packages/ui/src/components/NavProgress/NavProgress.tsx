import { useRouterState } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import styles from './NavProgress.module.css';

/** Decorative (`aria-hidden`) and non-blocking: the screen stays interactive during navigation. Needs a TanStack Router context, so it ships from `@shadow-library/ui/router`. */
export function NavProgress(): ReactElement {
  const isNavigating = useRouterState({ select: state => state.isLoading });
  return <div className={styles.bar} data-active={isNavigating || undefined} aria-hidden="true" />;
}
