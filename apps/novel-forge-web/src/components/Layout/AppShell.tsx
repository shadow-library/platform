/**
 * Importing npm packages
 */
import { useLocation } from '@tanstack/react-router';
import { type PropsWithChildren, useEffect, useState } from 'react';

/**
 * Importing user defined modules
 */
import styles from './AppShell.module.css';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

/**
 * The application chrome shared by every screen: a mode-aware sidebar, the top
 * bar, and a single scrolling content region. The content region is a
 * positioning context so full-bleed screens (the editor, chat, bible) can fill
 * it edge to edge. Under the tablet breakpoint the sidebar collapses to an
 * off-canvas drawer toggled from the top bar (see `.nf-sidebar` in styles.css).
 */
export default function AppShell({ children }: PropsWithChildren): React.JSX.Element {
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // Navigating always closes the mobile drawer so a tapped nav item doesn't leave it hanging open.
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className={styles.shell}>
      <Sidebar open={navOpen} />
      <div className="nf-shell-scrim" data-open={navOpen} onClick={() => setNavOpen(false)} aria-hidden="true" />
      <main className={styles.main}>
        <Topbar onMenuClick={() => setNavOpen(true)} />
        <div className={`nf-scroll ${styles.content}`}>{children}</div>
      </main>
    </div>
  );
}
