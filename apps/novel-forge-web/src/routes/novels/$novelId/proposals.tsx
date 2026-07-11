/**
 * Importing npm packages
 */
import { Button, SegmentedControl, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

/**
 * Importing user defined modules
 */
import { PaneError, PaneLoader, StatusChip, type ChipIntent } from '@/components/nf';
import { type ProposalResponse, useApplyProposalMutation, useDiscardProposalMutation, useListProposalsQuery } from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import styles from './proposals.module.css';

export const Route = createFileRoute('/novels/$novelId/proposals')({
  component: ProposalsScreen,
});

const STATUS_INTENT: Record<string, ChipIntent> = {
  pending: 'warning',
  applied: 'success',
  discarded: 'neutral',
  superseded: 'neutral',
  conflicted: 'danger',
};

function statusIntent(status: string): ChipIntent {
  return STATUS_INTENT[status] ?? 'neutral';
}

function proposalTitle(p: ProposalResponse): string {
  return p.summary?.trim() || `${p.kind} · ${p.scopeType}`;
}

interface ProposalDetailProps {
  novelId: string;
  proposal: ProposalResponse;
}

function ProposalDetail({ novelId, proposal }: ProposalDetailProps): React.JSX.Element {
  const apply = useApplyProposalMutation(novelId);
  const discard = useDiscardProposalMutation(novelId);
  const isPending = proposal.status === 'pending';
  const isConflicted = proposal.status === 'conflicted';

  const doApply = (): void => {
    apply.mutate(proposal.id, { onSuccess: () => toast.success('Applied to canon'), onError: err => toast.danger(err.message) });
  };
  const doDiscard = (): void => {
    discard.mutate(proposal.id, { onSuccess: () => toast.success('Proposal discarded'), onError: err => toast.danger(err.message) });
  };

  return (
    <div className={`nf-scroll ${styles.detailScroll}`}>
      <div className={styles.detailInner}>
        <div className={styles.metaRow}>
          <StatusChip intent={statusIntent(proposal.status)}>{proposal.status}</StatusChip>
          <StatusChip intent="neutral">{proposal.kind}</StatusChip>
          <StatusChip intent="neutral">{proposal.scopeType}</StatusChip>
          <div className={styles.spacer} />
          {proposal.model && <span className={styles.model}>{proposal.model}</span>}
        </div>
        <h1 className={styles.title}>{proposalTitle(proposal)}</h1>

        {isConflicted && (
          <div className={styles.conflict}>
            <div>
              <div className={styles.conflictTitle}>Baseline changed underneath this proposal</div>
              <div className={styles.conflictBody}>
                The canon moved on since this was drafted, so it can no longer apply cleanly. Discard it and ask again for a fresh proposal.
              </div>
            </div>
          </div>
        )}

        <div className={`nf-eyebrow ${styles.changeSetLabel}`}>
          Proposed change-set · {proposal.changeSet.length} op{proposal.changeSet.length === 1 ? '' : 's'}
        </div>
        <div className={styles.changeSet}>
          {proposal.changeSet.map((op, i) => (
            <pre key={i} className={styles.op}>
              {JSON.stringify(op, null, 2)}
            </pre>
          ))}
        </div>

        {isPending ? (
          <div className={styles.actions}>
            <Button variant="primary" loading={apply.isPending} onClick={doApply}>
              Apply to canon
            </Button>
            <Button variant="ghost" loading={discard.isPending} onClick={doDiscard}>
              Discard
            </Button>
          </div>
        ) : (
          <p className={styles.statusNote}>
            This proposal is {proposal.status}
            {proposal.appliedAt ? ` · ${relativeTime(proposal.appliedAt)}` : ''}.
          </p>
        )}
      </div>
    </div>
  );
}

type Filter = 'pending' | 'all';

function ProposalsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const [filter, setFilter] = useState<Filter>('pending');
  const proposalsQuery = useListProposalsQuery(novelId, { limit: 100, ...(filter === 'pending' ? { status: 'pending' } : {}) });
  const proposals = useMemo(() => proposalsQuery.data?.items ?? [], [proposalsQuery.data]);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  useEffect(() => {
    if (!proposals.some(p => p.id === selectedId)) setSelectedId(proposals[0]?.id);
  }, [proposals, selectedId]);

  const selected = proposals.find(p => p.id === selectedId);
  const pendingCount = proposals.filter(p => p.status === 'pending').length;

  return (
    <div className="nf-splitpane">
      <div className="nf-rail">
        <div className="nf-railhead">
          <div className={styles.railTitleRow}>
            <span className={styles.railTitle}>Proposals Center</span>
            {pendingCount > 0 && <StatusChip intent="warning">{pendingCount} pending</StatusChip>}
          </div>
          <SegmentedControl value={filter} onValueChange={v => setFilter(v as Filter)} size="sm">
            <SegmentedControl.Item value="pending">Pending</SegmentedControl.Item>
            <SegmentedControl.Item value="all">All</SegmentedControl.Item>
          </SegmentedControl>
        </div>
        <div className="nf-scroll nf-raillist">
          {proposalsQuery.isLoading && <PaneLoader />}
          {proposalsQuery.error && <PaneError error={proposalsQuery.error} />}
          {!proposalsQuery.isLoading && proposals.length === 0 && <div className="nf-emptynote">No proposals here.</div>}
          {proposals.map(proposal => (
            <button
              key={proposal.id}
              className="nf-selrow nf-selrow-stack"
              data-active={proposal.id === selectedId}
              onClick={() => setSelectedId(proposal.id)}
              style={proposal.status === 'conflicted' ? ({ '--nf-bar': 'var(--sh-danger-solid)' } as React.CSSProperties) : undefined}
            >
              <div className={styles.cardRow}>
                <StatusChip intent={statusIntent(proposal.status)}>{proposal.status}</StatusChip>
                <StatusChip intent="neutral">{proposal.kind}</StatusChip>
                <div className={styles.spacer} />
                <span className={styles.cardTime}>{relativeTime(proposal.createdAt)}</span>
              </div>
              <div className={styles.cardTitle}>{proposalTitle(proposal)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="nf-detail">
        {selected ? <ProposalDetail novelId={novelId} proposal={selected} /> : <div className="nf-pane-empty">Select a proposal to review.</div>}
      </div>
    </div>
  );
}
