import { type ReactElement } from 'react';
import { Alert, Drawer, EmptyState, Spinner } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { type BibleAuditReportResponse, useListAuditsQuery } from '@/lib/apis';
import { auditOpenCount, auditProposalIntent, auditProposalLabel } from '@/lib/bible-audit';
import { relativeTime } from '@/lib/format';

import styles from './AuditDialog.module.css';

export interface AuditHistoryDrawerProps {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (report: BibleAuditReportResponse) => void;
}

export function AuditHistoryDrawer({ novelId, open, onOpenChange, onSelect }: AuditHistoryDrawerProps): ReactElement {
  const list = useListAuditsQuery(novelId, open);
  const items = list.data?.items ?? [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange} placement="right" size="sm">
      <Drawer.Header title="Audit history" meta="Newest first" />
      <Drawer.Body className={styles.historyBody}>
        {list.isLoading ? (
          <div className={styles.loading}>
            <Spinner size="lg" label="Loading past audits" />
          </div>
        ) : list.error ? (
          <Alert intent="danger" title="Couldn’t load past audits" action={{ label: 'Retry', onClick: () => void list.refetch() }}>
            {list.error.message}
          </Alert>
        ) : items.length === 0 ? (
          <EmptyState size="inline" title="No audits yet" description="Run a bible audit and its results are kept here." />
        ) : (
          <ul className={styles.historyList}>
            {items.map(item => (
              <li key={item.id}>
                <button type="button" className={styles.historyRow} onClick={() => onSelect(item)}>
                  <span className={styles.historySummary}>{item.summary}</span>
                  <span className={styles.historyMeta}>
                    <span>{relativeTime(item.createdAt)}</span>
                    {auditOpenCount(item) > 0 && <StatusChip intent="warning">{auditOpenCount(item)} open</StatusChip>}
                    {item.proposalStatus && <StatusChip intent={auditProposalIntent(item.proposalStatus)}>{auditProposalLabel(item.proposalStatus)}</StatusChip>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer.Body>
    </Drawer>
  );
}
