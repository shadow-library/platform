import styles from './PageSkeleton.module.css';

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
