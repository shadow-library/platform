/**
 * Importing npm packages
 */
import { Button, SegmentedControl, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

/**
 * Importing user defined modules
 */
import { PaneError, PaneLoader, StatusChip, detailPaneStyle, railStyle, splitPaneStyle, type ChipIntent } from '@/components/nf';
import { type ProposalResponse, useApplyProposalMutation, useDiscardProposalMutation, useListProposalsQuery } from '@/lib/apis';
import { relativeTime } from '@/lib/format';

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
    <div className="nf-scroll" style={{ flex: 1, minHeight: 0, padding: '22px 26px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <StatusChip intent={statusIntent(proposal.status)}>{proposal.status}</StatusChip>
          <StatusChip intent="neutral">{proposal.kind}</StatusChip>
          <StatusChip intent="neutral">{proposal.scopeType}</StatusChip>
          <div style={{ flex: 1 }} />
          {proposal.model && <span style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)', fontFamily: 'var(--sh-font-mono)' }}>{proposal.model}</span>}
        </div>
        <h1 style={{ margin: '6px 0 14px', fontSize: 'var(--sh-text-h2)', fontWeight: 700, letterSpacing: '-0.01em' }}>{proposalTitle(proposal)}</h1>

        {isConflicted && (
          <div style={{ display: 'flex', gap: 11, padding: '14px 16px', background: 'var(--sh-danger-bg-subtle)', border: '1px solid var(--sh-danger-border)', borderRadius: 'var(--sh-radius-lg)', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 700, color: 'var(--sh-danger-text-on-subtle)', marginBottom: 2 }}>Baseline changed underneath this proposal</div>
              <div style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', lineHeight: 1.5 }}>
                The canon moved on since this was drafted, so it can no longer apply cleanly. Discard it and ask again for a fresh proposal.
              </div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--sh-text-tertiary)', marginBottom: 8 }}>
          Proposed change-set · {proposal.changeSet.length} op{proposal.changeSet.length === 1 ? '' : 's'}
        </div>
        <div style={{ border: '1px solid var(--sh-border-default)', borderRadius: 'var(--sh-radius-lg)', overflow: 'hidden', marginBottom: 18 }}>
          {proposal.changeSet.map((op, i) => (
            <pre
              key={i}
              style={{
                margin: 0,
                padding: '12px 16px',
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--sh-font-mono)',
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--sh-text-secondary)',
                borderTop: i > 0 ? '1px solid var(--sh-border-subtle)' : undefined,
              }}
            >
              {JSON.stringify(op, null, 2)}
            </pre>
          ))}
        </div>

        {isPending ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" loading={apply.isPending} onClick={doApply}>
              Apply to canon
            </Button>
            <Button variant="ghost" loading={discard.isPending} onClick={doDiscard}>
              Discard
            </Button>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>
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
    <div style={splitPaneStyle}>
      <div style={railStyle}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--sh-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 'var(--sh-text-body)', fontWeight: 700 }}>Proposals Center</span>
            {pendingCount > 0 && <StatusChip intent="warning">{pendingCount} pending</StatusChip>}
          </div>
          <SegmentedControl value={filter} onValueChange={v => setFilter(v as Filter)} size="sm">
            <SegmentedControl.Item value="pending">Pending</SegmentedControl.Item>
            <SegmentedControl.Item value="all">All</SegmentedControl.Item>
          </SegmentedControl>
        </div>
        <div className="nf-scroll" style={{ flex: 1, padding: 8 }}>
          {proposalsQuery.isLoading && <PaneLoader />}
          {proposalsQuery.error && <PaneError error={proposalsQuery.error} />}
          {!proposalsQuery.isLoading && proposals.length === 0 && <div style={{ padding: 16, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>No proposals here.</div>}
          {proposals.map(proposal => {
            const selectedRow = proposal.id === selectedId;
            const barColor = proposal.status === 'conflicted' ? 'var(--sh-danger-solid)' : 'var(--sh-accent)';
            return (
              <button
                key={proposal.id}
                className="nf-selrow"
                onClick={() => setSelectedId(proposal.id)}
                style={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 5,
                  padding: 12,
                  marginBottom: 4,
                  background: selectedRow ? 'var(--sh-accent-soft)' : undefined,
                  boxShadow: selectedRow ? `inset 2px 0 0 ${barColor}` : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusChip intent={statusIntent(proposal.status)}>{proposal.status}</StatusChip>
                  <StatusChip intent="neutral">{proposal.kind}</StatusChip>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: 'var(--sh-text-tertiary)' }}>{relativeTime(proposal.createdAt)}</span>
                </div>
                <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, color: 'var(--sh-text-primary)', textAlign: 'left' }}>{proposalTitle(proposal)}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={detailPaneStyle}>
        {selected ? (
          <ProposalDetail novelId={novelId} proposal={selected} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--sh-text-tertiary)' }}>Select a proposal to review.</div>
        )}
      </div>
    </div>
  );
}
