/**
 * Importing npm packages
 */
import { type PropsWithChildren } from 'react';

/**
 * Importing user defined components
 */
import Footer from './Footer';
import GlobalSidebar from './GlobalSidebar';
import TopNavbar from './TopNavbar';

/**
 * Importing styles
 */
import styles from './Layout.module.css';

/** App-level chrome: global rail (Dashboard / Projects / …) + top bar. */
export default function GlobalShell({ children }: PropsWithChildren) {
  return (
    <div>
      <TopNavbar />
      <GlobalSidebar />
      <main className={styles.main}>
        <div className="p-6 min-h-[calc(100vh-7rem)]">{children}</div>
        <Footer />
      </main>
    </div>
  );
}
