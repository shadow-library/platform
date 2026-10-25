import { type ReactElement } from 'react';

import controls from './controls.module.css';
import { formatRate } from './format';
import styles from './ShareCell.module.css';

export function ShareCell({ share }: { share: number | null }): ReactElement {
  return (
    <span className={styles.share}>
      <span className={styles.bar} aria-hidden>
        <span className={styles.barFill} style={{ width: `${Math.round((share ?? 0) * 100)}%` }} />
      </span>
      <span className={controls.tabular}>{formatRate(share)}</span>
    </span>
  );
}
