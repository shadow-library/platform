/**
 * Importing npm packages
 */
import { type PropsWithChildren } from 'react';

/**
 * Importing user defined components
 */
import TopNavbar from './TopNavbar';
import GlobalShell from './GlobalShell';
import WorkspaceShell from './WorkspaceShell';
import Footer from './Footer';

/**
 * Bare layout with the top bar only — used by chrome-less pages (e.g. auth)
 * that still want the brand header. Route groups that need a sidebar use
 * {@link GlobalShell} or {@link WorkspaceShell} instead.
 */
export default function Layout({ children }: PropsWithChildren) {
  return (
    <div>
      <TopNavbar />
      <main className="mt-16">
        <div className="p-6 min-h-[calc(100vh-7rem)]">{children}</div>
        <Footer />
      </main>
    </div>
  );
}

export { TopNavbar, GlobalShell, WorkspaceShell, Footer };
