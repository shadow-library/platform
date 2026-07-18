/**
 * Importing npm packages
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, useEffect, useMemo, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useMediaQuery } from '@/hooks';
import { cn, mergeRefs } from '@/lib';

import { ShellMobileNavAreaContext, ShellMobileNavContext } from './Shell.context';
import styles from './Shell.module.css';
import { type PageProps, type ShellProps } from './Shell.types';

/**
 * The application scaffold: a sidebar landmark, a top bar, and the `main` content region, with the
 * mandatory skip-to-content link rendered as the first tab stop so products can't forget it. The shell
 * is also where theme and density mount — one place, app-wide. Chrome reads surface-app (the
 * no-contrasting-panel rule); compose the actual furniture from `Sidebar` and `TopNavigation`.
 *
 * Below the md breakpoint the persistent sidebar yields automatically to a modal nav drawer: the same
 * `sidebar` element is projected into a left-edge Radix Dialog, opened by the hamburger TopNavigation
 * surfaces (via ShellMobileNavContext), closed by scrim tap, Esc, item navigation, or growing back to
 * desktop. The drawer portals into the shell root so theme and density cascade into it.
 */
export const Shell = forwardRef<HTMLDivElement, ShellProps>(function Shell({ sidebar, topbar, theme = 'light', density = 'comfortable', className, children, ...props }, ref) {
  const [navOpen, setNavOpen] = useState(false);
  const [shellElement, setShellElement] = useState<HTMLDivElement | null>(null);
  // Breakpoint token --sh-breakpoint-md (768px) — the same edge the CSS uses to swap sidebar for drawer.
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const hasSidebar = sidebar != null;

  // Growing back to desktop dismisses the drawer — the persistent sidebar has returned.
  useEffect(() => {
    if (isDesktop && navOpen) setNavOpen(false);
  }, [isDesktop, navOpen]);

  const mobileNav = useMemo(() => ({ hasSidebar, open: navOpen, setOpen: setNavOpen }), [hasSidebar, navOpen]);
  const drawerArea = useMemo(() => ({ close: () => setNavOpen(false) }), []);
  // Memoized so the ref identity is stable — an inline merge would detach/re-attach every render
  // and re-fire the state setter, looping the render.
  const shellRef = useMemo(() => mergeRefs<HTMLDivElement>(ref, setShellElement), [ref]);

  return (
    <ShellMobileNavContext.Provider value={mobileNav}>
      <div ref={shellRef} className={cn(styles.shell, theme === 'dark' && 'dark', className)} data-density={density === 'compact' ? 'compact' : undefined} {...props}>
        <a href="#sh-main-content" className={styles.skipLink}>
          Skip to content
        </a>
        {hasSidebar ? <div className={styles.sidebarSlot}>{sidebar}</div> : null}
        <div className={styles.body}>
          {topbar}
          <main id="sh-main-content" className={styles.main}>
            {children}
          </main>
        </div>
        {hasSidebar ? (
          <DialogPrimitive.Root open={navOpen} onOpenChange={setNavOpen}>
            <DialogPrimitive.Portal container={shellElement ?? undefined}>
              <DialogPrimitive.Overlay className={styles.navScrim} />
              <DialogPrimitive.Content className={styles.navDrawer}>
                <DialogPrimitive.Title className={styles.srOnly}>Navigation</DialogPrimitive.Title>
                <ShellMobileNavAreaContext.Provider value={drawerArea}>{sidebar}</ShellMobileNavAreaContext.Provider>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        ) : null}
      </div>
    </ShellMobileNavContext.Provider>
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
