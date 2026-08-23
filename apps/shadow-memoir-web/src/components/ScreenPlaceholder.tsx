import { type ReactElement, type ReactNode } from 'react';

import styles from './ScreenPlaceholder.module.css';

export interface ScreenPlaceholderProps {
  title: string;
  /** One factual sentence describing what this surface will hold. No exclamation marks, no cheerleading. */
  summary: string;
  children?: ReactNode;
}

/**
 * The body every screen renders until its own phase builds it. It carries the screen's real title and a
 * factual description so the shell, navigation and route tree can be exercised end to end — and so a
 * half-built surface still reads as deliberate rather than broken.
 */
export function ScreenPlaceholder({ title, summary, children }: ScreenPlaceholderProps): ReactElement {
  return (
    <section className={styles.screen} aria-labelledby="screen-title">
      <h1 className={styles.title} id="screen-title">
        {title}
      </h1>
      <p className={styles.summary}>{summary}</p>
      <p className={styles.pending}>{children ?? 'This surface is not built yet.'}</p>
    </section>
  );
}
