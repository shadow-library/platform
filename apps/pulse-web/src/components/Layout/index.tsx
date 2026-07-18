/**
 * Importing npm packages
 */
import { type PropsWithChildren, type ReactElement } from 'react';
import { cn } from '@shadow-library/ui';

/**
 * Importing user defined components
 */
import AppSidebar from './AppSidebar';
import Header from './Header';
import styles from './Layout.module.css';

export default function Layout({ children }: PropsWithChildren): ReactElement {
  return (
    <div className={styles.shell}>
      <AppSidebar />
      <div className={styles.main}>
        <Header />
        <main className={cn('pulse-scroll', styles.content)}>{children}</main>
      </div>
    </div>
  );
}

export { AppSidebar, Header };
