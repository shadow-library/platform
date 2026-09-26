import { type KeyboardEvent, type ReactElement } from 'react';
import { Input, SegmentedControl } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { type AuditFindingDecision, type BibleAuditFindingResponse } from '@/lib/apis';
import { auditDecisionLabel, auditGroupLabel, findingDecidable, humanizeAuditRef } from '@/lib/bible-audit';

import styles from './AuditDialog.module.css';

export interface AuditFindingCardProps {
  finding: BibleAuditFindingResponse;
  /** Position within its group, so two findings that resolve to the same human ref still get distinct control labels. */
  index: number;
  humanRef: string;
  names: ReadonlyMap<string, string>;
  docTitles: ReadonlyMap<string, string>;
  decision: AuditFindingDecision;
  reason: string;
  readOnly: boolean;
  busy: boolean;
  onDecisionChange: (decision: AuditFindingDecision) => void;
  onReasonChange: (value: string) => void;
  onReasonCommit: () => void;
}

export function AuditFindingCard({
  finding,
  index,
  humanRef,
  names,
  docTitles,
  decision,
  reason,
  readOnly,
  busy,
  onDecisionChange,
  onReasonChange,
  onReasonCommit,
}: AuditFindingCardProps): ReactElement {
  const decidable = findingDecidable(finding);
  const label = `${humanRef} (${auditGroupLabel(finding.group)} ${index + 1})`;

  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') onReasonCommit();
  };

  return (
    <div className={styles.finding} data-group={finding.group}>
      <div className={styles.findingMain}>
        <div className={styles.findingHead}>
          <span className={styles.findingTitle}>{humanRef}</span>
          {!decidable && <StatusChip intent="neutral">Flagged only</StatusChip>}
          {decidable && readOnly && <StatusChip intent="neutral">{auditDecisionLabel(decision)}</StatusChip>}
        </div>
        <p className={styles.findingText}>{finding.text}</p>
        {finding.evidence.length > 0 && (
          <ul className={styles.evidence}>
            {finding.evidence.map((item, i) => (
              <li key={`${item.ref}-${i}`}>
                <span className={styles.evidenceRef}>{humanizeAuditRef(item.ref, names, docTitles)}</span>
                {item.quote && <q>{item.quote}</q>}
              </li>
            ))}
          </ul>
        )}
        {finding.withheld && <p className={styles.withheld}>Not staged: {finding.withheld}</p>}
      </div>

      {decidable && (
        <div className={styles.decision}>
          <SegmentedControl size="sm" aria-label={`Keep or skip: ${label}`} value={decision} onValueChange={value => onDecisionChange(value as AuditFindingDecision)}>
            <SegmentedControl.Item value="kept" disabled={busy || readOnly}>
              Keep
            </SegmentedControl.Item>
            <SegmentedControl.Item value="skipped" disabled={busy || readOnly}>
              Skip
            </SegmentedControl.Item>
          </SegmentedControl>
          {decision === 'skipped' && (
            <Input
              className={styles.decisionReason}
              size="sm"
              value={reason}
              onValueChange={onReasonChange}
              onBlur={onReasonCommit}
              onKeyDown={commitOnEnter}
              placeholder="Why skip it? (optional)"
              aria-label={`Reason for skipping ${label}`}
              disabled={busy || readOnly}
            />
          )}
        </div>
      )}
    </div>
  );
}
