import { type ReactElement } from 'react';

import { CheckIcon, WarningIcon } from '@/components/icons';

import styles from './blueprint.module.css';
import { type CoverageLine } from './import-coverage';

/** What an import's content already covers, one line per phase plus the voice sample. */
export function CoverageLines({ lines }: { lines: CoverageLine[] }): ReactElement {
  return (
    <ul className={styles.coverageList}>
      {lines.map(line => (
        <li key={line.id} className={styles.coverageRow} data-intent={line.intent}>
          {line.intent === 'covered' ? <CheckIcon size={13} /> : <WarningIcon size={13} />}
          <span>
            <b>{line.label}:</b> {line.evidence}
          </span>
        </li>
      ))}
    </ul>
  );
}
