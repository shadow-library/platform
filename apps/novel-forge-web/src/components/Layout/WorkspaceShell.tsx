/**
 * Importing npm packages
 */
import { type PropsWithChildren } from 'react';

/**
 * Importing user defined components
 */
import Footer from './Footer';
import TopNavbar from './TopNavbar';
import WorkspaceSidebar from './WorkspaceSidebar';

/**
 * Importing styles
 */
import styles from './Layout.module.css';

/** Per-novel workspace chrome: Plan / Lore / Write / QA sidebar + top bar. */
export default function WorkspaceShell({ children }: PropsWithChildren) {
  return (
    <div>
      <TopNavbar />
      <WorkspaceSidebar />
      <main className={styles.main}>
        <div className="p-6 min-h-[calc(100vh-7rem)]">{children}</div>
        <Footer />
      </main>
    </div>
  );
}
