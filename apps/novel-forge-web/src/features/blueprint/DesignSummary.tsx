import { type ReactElement } from 'react';
import { Button } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { type BlueprintPhaseProgressResponse, type LedgerEntryResponse } from '@/lib/apis';

import styles from './blueprint.module.css';
import { type GatePhaseSummary, gateSummary, stopTest } from './gate';

const NOTHING_YET = 'Nothing settled here yet.';

interface DesignCellProps {
  cell: GatePhaseSummary;
  onRevisit?: (step: string) => void;
}

function DesignCell({ cell, onRevisit }: DesignCellProps): ReactElement {
  const step = cell.step;
  return (
    <section className={styles.designCell}>
      <div className={styles.designCellHead}>
        <span className="nf-eyebrow">{cell.label}</span>
        <StatusChip intent={cell.done ? 'success' : 'neutral'}>{cell.done ? 'Done' : 'Open'}</StatusChip>
      </div>
      <p className={styles.designCellBody}>{cell.parts.length > 0 ? cell.parts.join(' · ') : NOTHING_YET}</p>
      {onRevisit && step != null && (
        <Button variant="text" size="sm" onClick={() => onRevisit(step)}>
          Revisit {cell.label}
        </Button>
      )}
    </section>
  );
}

export interface DesignSummaryProps {
  phases: BlueprintPhaseProgressResponse[];
  entries: LedgerEntryResponse[];
  /** Reopening a phase from here is the Workspace's way back in; omit it and the summary is a read-only page. */
  onRevisit?: (step: string) => void;
}

/** The whole design on one page: what each phase settled, then the three questions the author answers in their own words. */
export function DesignSummary({ phases, entries, onRevisit }: DesignSummaryProps): ReactElement {
  return (
    <>
      <div className={styles.designGrid}>
        {gateSummary(phases, entries).map(cell => (
          <DesignCell key={cell.phase} cell={cell} onRevisit={onRevisit} />
        ))}
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Stop test: your answers</h2>
        <dl className={styles.stopTest}>
          {stopTest(entries).map(question => (
            <div key={question.id}>
              <dt>{question.question}</dt>
              <dd data-empty={question.answer === null}>{question.answer ?? 'Not answered by any decision yet.'}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
