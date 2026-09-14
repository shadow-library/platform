import { type ReactElement, type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { useMediaQuery } from '@shadow-library/ui';

import styles from './ScreenLayout.module.css';

export { styles as screenStyles };

export interface ScreenProps {
  /** Also names the screen's landmark, so the heading and the region never drift apart. */
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Screen({ title, subtitle, actions, children }: ScreenProps): ReactElement {
  const headingId = `${title.toLowerCase().replace(/[^a-z]+/g, '-')}-title`;
  return (
    <section className={styles.screen} aria-labelledby={headingId}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title} id={headingId}>
            {title}
          </h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export interface ScreenColumnsProps {
  children: ReactNode;
  /** Stacks after the main column below 1000px, so it holds secondary content; pair a selection's detail with `useRevealOnSelect`. */
  aside: ReactNode;
}

export function ScreenColumns({ children, aside }: ScreenColumnsProps): ReactElement {
  return (
    <div className={styles.columns}>
      <div className={styles.column}>{children}</div>
      <div className={styles.column}>{aside}</div>
    </div>
  );
}

/**
 * Reveals a selection's detail on narrow layouts, where the aside stacks far below its trigger: scrolls
 * the returned ref's element into view (skipped if it is already fully visible) and focuses it once
 * `ready`. Never fires for the id a component mounts (or auto-selects) with — only for a `selectedId`
 * that changes afterwards — and never at `narrowQuery`'s wider width, so desktop behaviour is untouched.
 */
export function useRevealOnSelect<T extends HTMLElement>(selectedId: string, ready: boolean, narrowQuery = '(max-width: 999px)'): RefObject<T | null> {
  const target = useRef<T>(null);
  const previousId = useRef(selectedId);
  const pending = useRef(false);
  const isNarrow = useMediaQuery(narrowQuery);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    if (selectedId !== previousId.current) {
      previousId.current = selectedId;
      pending.current = isNarrow;
    }
    if (!pending.current || !ready || !target.current) return;
    pending.current = false;

    const rect = target.current.getBoundingClientRect();
    const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!fullyVisible) target.current.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    target.current.focus({ preventScroll: true });
  }, [selectedId, ready, isNarrow, reduceMotion]);

  return target;
}
