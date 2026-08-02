/**
 * Importing npm packages
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useMediaQuery } from '@/hooks';
import { cn, mergeRefs } from '@/lib';

import { ShellContentContext, ShellMobileNavAreaContext, ShellMobileNavContext } from './Shell.context';
import styles from './Shell.module.css';
import { type PageProps, type ShellNav, type ShellProps } from './Shell.types';

/**
 * Declaring the constants
 */
const NO_SHELL_NAV: ShellNav = { hasSidebar: false, open: false, setOpen: () => undefined };

/**
 * The platform's reading column, in pixels — the width every Shadow app's content settles on unless it
 * asks for something else. Mirrored as the `--sh-page-max` token for full-bleed apps that take the content
 * region whole (`contentPadding="none"`) and therefore have to centre their own column in CSS; change both
 * together.
 */
export const PAGE_WIDTH = 1200;

/**
 * The application scaffold: a sidebar landmark, a top bar, and the `main` content region, with the
 * mandatory skip-to-content link rendered as the first tab stop so products can't forget it. The shell
 * is also where theme and density mount — one place, app-wide. Chrome reads surface-app (the
 * no-contrasting-panel rule); compose the actual furniture from `Sidebar` and `TopNavigation`.
 *
 * Below the md breakpoint the persistent sidebar yields automatically to a modal nav drawer: the same
 * `sidebar` element is projected into a left-edge Radix Dialog, opened by the hamburger TopNavigation
 * surfaces (via ShellMobileNavContext) or by any custom trigger wired to `useShellNav`, closed by scrim
 * tap, Esc, item navigation, or growing back to desktop. The drawer portals into the shell root so
 * theme and density cascade into it.
 *
 * The shell also owns the content region beside the sidebar so products never re-implement it: gutters
 * that step up with the viewport and clear display cutouts, and a centered reading column capped at
 * `contentWidth`. From md up the chrome is pinned and only that region scrolls; below it the document
 * scrolls so mobile browsers keep their URL-bar auto-hide.
 */
export const Shell = forwardRef<HTMLDivElement, ShellProps>(function Shell(
  { sidebar, topbar, bottomNav, theme = 'light', density = 'comfortable', contentWidth = PAGE_WIDTH, contentPadding = 'md', className, children, ...props },
  ref,
) {
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
      <div
        ref={shellRef}
        className={cn(styles.shell, theme === 'dark' && 'dark', className)}
        data-density={density === 'compact' ? 'compact' : undefined}
        data-bottom-nav={bottomNav != null || undefined}
        {...props}
      >
        <a href="#sh-main-content" className={styles.skipLink}>
          Skip to content
        </a>
        {hasSidebar ? <div className={styles.sidebarSlot}>{sidebar}</div> : null}
        <div className={styles.body}>
          {topbar}
          <main id="sh-main-content" className={styles.main} data-padding={contentPadding}>
            <div className={styles.content} style={{ maxWidth: contentWidth === 'fluid' ? undefined : contentWidth }}>
              <ShellContentContext.Provider value={true}>{children}</ShellContentContext.Provider>
            </div>
          </main>
        </div>
        {/* Rendered unconditionally and hidden by CSS from md up: gating it on a media-query hook would
            leave it out of the server render and pop it in after hydration, on the one layout that needs
            it most. */}
        {bottomNav != null ? <div className={styles.bottomNav}>{bottomNav}</div> : null}
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
 * The page header + content region: breadcrumbs, title, description, and actions above the page body.
 *
 * Inside a shell the gutters and the reading column come from the shell, so a page only adds its
 * header — passing `maxWidth` narrows this one page below the shell's column. Standalone (no shell)
 * the page still frames itself, so a bare `<Page>` keeps its own padding and 1200px column.
 */
export const Page = forwardRef<HTMLDivElement, PageProps>(function Page({ title, description, breadcrumbs, actions, maxWidth, className, children, ...props }, ref) {
  const framed = useContext(ShellContentContext);
  const hasHeader = title != null || description != null || breadcrumbs != null || actions != null;
  const resolved = maxWidth ?? (framed ? 'fluid' : PAGE_WIDTH);
  const width = resolved === 'fluid' ? undefined : resolved;
  return (
    <div ref={ref} className={cn(styles.page, className)} data-framed={framed || undefined} {...props}>
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

/**
 * Drives the shell's mobile nav drawer from a product's own top bar — `TopNavigation` uses it for its
 * hamburger, and an app that renders a bespoke header wires the same state to its own trigger. Safe
 * outside a shell, where `hasSidebar` is false and there is nothing to open.
 */
export function useShellNav(): ShellNav {
  return useContext(ShellMobileNavContext) ?? NO_SHELL_NAV;
}
