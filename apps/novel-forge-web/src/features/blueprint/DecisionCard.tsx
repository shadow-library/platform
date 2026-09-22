import { type ReactElement, type ReactNode } from 'react';

import { StatusChip } from '@/components/nf';

import { COST_TO_CHANGE_LABELS, type CostToChange } from './blueprint-steps';
import styles from './blueprint.module.css';

const COST_INTENT: Record<CostToChange, 'success' | 'warning' | 'danger'> = {
  cheap: 'success',
  medium: 'warning',
  expensive: 'danger',
};

export interface DecisionCardProps {
  title: ReactNode;
  decision: ReactNode;
  why?: ReactNode;
  rejected?: string[];
  /** What the decision means for the chapter writer — the line chapter packs carry. */
  writerLine?: ReactNode;
  cost?: CostToChange;
  /** An identity decision is the author's alone: the card says so instead of offering "decide for me". */
  identity?: boolean;
  actions?: ReactNode;
}

export function DecisionCard({ title, decision, why, rejected, writerLine, cost, identity, actions }: DecisionCardProps): ReactElement {
  return (
    <section className={styles.decision}>
      <header className={styles.decisionHead}>
        <h3 className={styles.decisionTitle}>{title}</h3>
        {identity === true && <StatusChip intent="accent">You choose</StatusChip>}
        {cost != null && (
          <StatusChip intent={COST_INTENT[cost]} dot>
            {COST_TO_CHANGE_LABELS[cost]}
          </StatusChip>
        )}
        {actions != null && <div className={styles.decisionActions}>{actions}</div>}
      </header>
      <dl className={styles.decisionList}>
        <dt>Decision</dt>
        <dd>{decision}</dd>
        {why != null && (
          <>
            <dt>Why</dt>
            <dd>{why}</dd>
          </>
        )}
        {rejected != null && rejected.length > 0 && (
          <>
            <dt>Rejected</dt>
            <dd>{rejected.join('; ')}</dd>
          </>
        )}
        {writerLine != null && (
          <>
            <dt>Means for the writer</dt>
            <dd>{writerLine}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
