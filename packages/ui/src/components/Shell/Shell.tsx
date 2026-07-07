/**
 * Importing npm packages
 */
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Shell.module.css';
import { type PageProps, type ShellProps } from './Shell.types';

/**
 * The application scaffold: a sidebar landmark, a top bar, and the `main` content region, with the
 * mandatory skip-to-content link rendered as the first tab stop so products can't forget it. The shell
 * is also where theme and density mount — one place, app-wide. Chrome reads surface-app (the
 * no-contrasting-panel rule); compose the actual furniture from `Sidebar` and `TopNavigation`.
 */
export const Shell = forwardRef<HTMLDivElement, ShellProps>(function Shell({ sidebar, topbar, theme = 'light', density = 'comfortable', className, children, ...props }, ref) {
  return (
    <div ref={ref} className={cn(styles.shell, theme === 'dark' && 'dark', className)} data-density={density === 'compact' ? 'compact' : undefined} {...props}>
      <a href='#sh-main-content' className={styles.skipLink}>
        Skip to content
      </a>
      {sidebar}
      <div className={styles.body}>
        {topbar}
        <main id='sh-main-content' className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
});

/**
 * The page header + content region: breadcrumbs, title, description, and actions above a padded,
 * max-width content column. Sits inside the shell's `main`.
 */
export const Page = forwardRef<HTMLDivElement, PageProps>(function Page({ title, description, breadcrumbs, actions, maxWidth = 1200, className, children, ...props }, ref) {
  const hasHeader = title != null || description != null || breadcrumbs != null || actions != null;
  const width = maxWidth === 'fluid' ? undefined : maxWidth;
  return (
    <div ref={ref} className={cn(styles.page, className)} {...props}>
      <div className={styles.pageInner} style={{ maxWidth: width }}>
        {hasHeader ? (
          <header className={styles.pageHeader}>
            {breadcrumbs != null ? <div className={styles.breadcrumbs}>{breadcrumbs}</div> : null}
            <div className={styles.titleRow}>
              <div className={styles.titleGroup}>
                {title != null ? <h1 className={styles.title}>{title}</h1> : null}
                {description != null ? <p className={styles.description}>{description}</p> : null}
              </div>
              {actions != null ? <div className={styles.actions}>{actions}</div> : null}
            </div>
          </header>
        ) : null}
        {children}
      </div>
    </div>
  );
});
