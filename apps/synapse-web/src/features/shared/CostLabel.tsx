import { type ReactElement } from 'react';
import { Tooltip } from '@shadow-library/ui';

import styles from './CostLabel.module.css';
import { InfoIcon } from './icons';

export type CostKind = 'billed' | 'list';

export const COST_LABELS: Readonly<Record<CostKind, string>> = { billed: 'Billed spend', list: 'API-price cost' };

export const COST_EXPLANATIONS: Readonly<Record<CostKind, string>> = {
  billed: 'What the providers actually charged for these calls. Subscription and local calls cost nothing here.',
  list: "What these calls would cost at the providers' list API prices. Budgets count this, so free subscription calls still use budget.",
};

export function CostLabel({ kind }: { kind: CostKind }): ReactElement {
  return (
    <span className={styles.label}>
      {COST_LABELS[kind]}
      <Tooltip content={COST_EXPLANATIONS[kind]}>
        <button type="button" className={styles.info} aria-label={`What ${COST_LABELS[kind].toLowerCase()} means`}>
          <InfoIcon />
        </button>
      </Tooltip>
    </span>
  );
}
