import { type ReactElement } from 'react';

import { Alert, Tooltip } from '@shadow-library/ui';

import { type BibleReadinessResponse } from '@/lib/apis';
import { advisoryGaps, DIMENSION_HINT, DIMENSION_LABEL, dimensionRatio, orderedDimensions, readinessHeadline, readinessIntent, verdictIntent } from '@/lib/bible-readiness';

import styles from './BibleReadiness.module.css';
import { StatusChip } from './StatusChip';

export interface BibleReadinessProps {
  report: BibleReadinessResponse;
  /** Runs the bible audit, which proposes the documents and records the gaps name. */
  onAudit?: () => void;
  auditPending?: boolean;
}

export function BibleReadiness({ report, onAudit, auditPending }: BibleReadinessProps): ReactElement {
  const advisory = advisoryGaps(report);
  const action = onAudit ? { label: auditPending ? 'Auditing…' : 'Audit the bible', onClick: onAudit } : undefined;

  return (
    <Alert intent={readinessIntent(report)} title={readinessHeadline(report)} action={action}>
      <div className={styles.dimensions}>
        {orderedDimensions(report).map(dimension => (
          <Tooltip key={dimension.dimension} content={DIMENSION_HINT[dimension.dimension]}>
            <span className={styles.dimension}>
              <StatusChip intent={verdictIntent(dimension.verdict)} dot>
                {DIMENSION_LABEL[dimension.dimension]}
              </StatusChip>
              <span className={styles.ratio}>{dimensionRatio(dimension)}</span>
            </span>
          </Tooltip>
        ))}
      </div>

      {report.blockingGaps.length > 0 && (
        <ul className={styles.gaps}>
          {report.blockingGaps.map(gap => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      )}

      {advisory.length > 0 && (
        <details className={styles.advisory}>
          <summary className={styles.summary}>
            {advisory.length} advisory note{advisory.length === 1 ? '' : 's'}
          </summary>
          <ul className={styles.gaps}>
            {advisory.map(gap => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </details>
      )}
    </Alert>
  );
}
