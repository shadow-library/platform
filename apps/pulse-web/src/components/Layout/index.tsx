/**
 * Importing npm packages
 */
import clsx from 'clsx';
import { type PropsWithChildren, type ReactElement } from 'react';

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
        <main className={clsx('pulse-scroll', styles.content)}>{children}</main>
      </div>
    </div>
  );
}

export { AppSidebar, Header };
