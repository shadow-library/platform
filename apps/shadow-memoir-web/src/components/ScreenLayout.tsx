import { type ReactElement, type ReactNode } from 'react';

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
