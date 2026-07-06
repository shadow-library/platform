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
        <div className="mx-auto w-full max-w-[1200px] p-6 min-h-[calc(100vh-7rem)]">{children}</div>
        <Footer />
      </main>
    </div>
  );
}
