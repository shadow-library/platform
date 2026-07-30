/**
 * Importing npm packages
 */
import { type PropsWithChildren } from 'react';
import { Shell } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import styles from './AppShell.module.css';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

/**
 * The application chrome shared by every screen. Shell places the sidebar, pins the chrome, and below
 * md swaps the sidebar for its nav drawer.
 *
 * The content region is handed over whole (`fluid` + no gutters) because screens here disagree about
 * what it is: document screens opt into the 1120px `nf-page` column, while the editor, chat, and bible
 * fill it edge to edge off `.content`'s positioning context (see `.nf-splitpane` in styles.css). A
 * shell-imposed column would box the latter in.
 */
export default function AppShell({ children }: PropsWithChildren): React.JSX.Element {
  return (
    <Shell sidebar={<Sidebar />} topbar={<Topbar />} contentWidth="fluid" contentPadding="none" className={styles.shellRoot}>
      <div className={`nf-scroll ${styles.content}`}>{children}</div>
    </Shell>
  );
}
