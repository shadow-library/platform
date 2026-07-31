/**
 * Importing npm packages
 */
import { type PropsWithChildren, type ReactElement } from 'react';
import { Shell } from '@shadow-library/ui';

/**
 * Importing user defined components
 */
import AppSidebar from './AppSidebar';
import Header from './Header';

/**
 * Declaring the constants
 */

/** The reading column every screen sits in; the shell centres it and supplies the gutters. */
const PAGE_WIDTH = 1200;

/**
 * The operations chrome. Shell places the rail, pins it, gutters and centres the content, and below md
 * swaps the rail for its nav drawer — the app had no layout at all under a desktop viewport before.
 */
export default function Layout({ children }: PropsWithChildren): ReactElement {
  return (
    <Shell sidebar={<AppSidebar />} topbar={<Header />} contentWidth={PAGE_WIDTH}>
      {children}
    </Shell>
  );
}

export { AppSidebar, Header };
