/**
 * Importing user defined modules
 */
import styles from './PageSkeleton.module.css';

/**
 * Declaring the constants
 */

/**
 * The router's default pending UI. Because loaders resolve route-critical data, the first paint of any
 * route is server-rendered (no skeleton); this shows only during a client navigation whose loader runs
 * past `defaultPendingMs`, and renders inside the persistent app shell's content area — a header bar plus a
 * card grid that approximates the list/dashboard screens. Decorative (`aria-hidden`) with a live-region
 * label so assistive tech hears one "Loading" rather than a wall of shimmer.
 */
export function PageSkeleton(): React.JSX.Element {
  return (
    <div className={styles.wrap} aria-busy="true">
      <span className={styles.srOnly} role="status">
        Loading
      </span>
      <div className={styles.header} aria-hidden="true">
        <div className={styles.title} />
        <div className={styles.subtitle} />
      </div>
      <div className={styles.grid} aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.card} />
        ))}
      </div>
    </div>
  );
}
