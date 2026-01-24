/**
 * Importing npm packages
 */
import { type PropsWithChildren } from 'react';

/**
 * Importing user defined components
 */
import TopNavbar from './TopNavbar';
import SideNavbar from './SideNavbar';
import Footer from './Footer';

/**
 * Importing styles
 */
import styles from './Layout.module.css';

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div>
      <TopNavbar />
      <SideNavbar />
      <main className={styles.main}>
        <div className="p-6 min-h-[calc(100vh-7rem)]">{children}</div>
        <Footer />
      </main>
    </div>
  );
}

export { TopNavbar, SideNavbar, Footer };
