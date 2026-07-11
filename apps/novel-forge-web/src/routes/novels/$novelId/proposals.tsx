/**
 * Importing npm packages
 */
import { Button, Checkbox, SegmentedControl, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { Fragment, useEffect, useMemo, useState } from 'react';

/**
 * Importing user defined modules
 */
import { Markdown, PaneError, PaneLoader, StatusChip, type ChipIntent } from '@/components/nf';
import { type ProposalResponse, useApplyProposalMutation, useDiscardProposalMutation, useListProposalsQuery, useRevertProposalMutation } from '@/lib/apis';
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
  reverted: 'info',
};

const OP_RESULT_INTENT: Record<string, ChipIntent> = {
  applied: 'success',
  declined: 'neutral',
  failed: 'danger',
  pending: 'warning',
};

function statusIntent(status: string): ChipIntent {
  return STATUS_INTENT[status] ?? 'neutral';
}

function proposalTitle(p: ProposalResponse): string {
  return p.summary?.trim() || `${p.kind} · ${p.scopeType}`;
}

/** A one-line human summary of a change-set op: its type plus the key that identifies the target. */
export function opLabel(op: Record<string, unknown>): string {
  const type = String(op.op ?? 'unknown');
  const target = op.volumeKey ?? op.arcKey ?? op.entityKey ?? (op.section !== undefined ? `${op.section}/${op.slug}` : undefined) ?? (op.chapter !== undefined ? `ch ${op.chapter}` : undefined);
  return target === undefined ? type : `${type} · ${target}`;
}

// Fields whose values are prose/Markdown — shown as a rendered block instead of an inline value.
const OP_PROSE_FIELDS = new Set(['body', 'premise', 'brief', 'objective', 'escalation', 'payoff', 'hook', 'conflict', 'motivation', 'notes', 'summary', 'instructions', 'note']);

function formatOpValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(v => String(v)).join(', ');
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * A readable view of one change-set op: the identifying/scalar fields as a compact key/value grid,
 * and the prose fields (a rewritten body, a new objective, a revision note) rendered as Markdown —
 * so a change reads as what it does, not as a raw JSON blob.
 */
export function ChangeOpBody({ op }: { op: Record<string, unknown> }): React.JSX.Element {
  const entries = Object.entries(op).filter(([k]) => k !== 'op' && op[k] !== undefined);
  const prose = entries.filter(([k, v]) => OP_PROSE_FIELDS.has(k) && typeof v === 'string' && v.trim() !== '');
  const inline = entries.filter(([k, v]) => !prose.some(([pk]) => pk === k) && v !== undefined);

  return (
    <div className={styles.opBody}>
      {inline.length > 0 && (
        <div className={styles.opFields}>
          {inline.map(([k, v]) => (
            <Fragment key={k}>
              <span className={styles.opFieldKey}>{k}</span>
              <span className={styles.opFieldVal}>{formatOpValue(v)}</span>
            </Fragment>
          ))}
        </div>
      )}
      {prose.map(([k, v]) => (
        <div key={k}>
          <div className={styles.opProseLabel}>{k}</div>
          <Markdown content={v as string} className={styles.opProse} />
        </div>
      ))}
    </div>
  );
}

interface ProposalDetailProps {
  novelId: string;
  proposal: ProposalResponse;
}

function ProposalDetail({ novelId, proposal }: ProposalDetailProps): React.JSX.Element {
  const apply = useApplyProposalMutation(novelId);
  const discard = useDiscardProposalMutation(novelId);
  const revert = useRevertProposalMutation(novelId);
  const isPending = proposal.status === 'pending';
  const isConflicted = proposal.status === 'conflicted';
  const isApplied = proposal.status === 'applied';
  const [declined, setDeclined] = useState<Set<number>>(new Set());
  const opResults = (proposal.opResults ?? []) as { index: number; status: string; error?: string; result?: Record<string, unknown> }[];

  useEffect(() => setDeclined(new Set()), [proposal.id]);

  const toggleOp = (index: number): void => {
    setDeclined(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const doApply = (): void => {
    const selected = proposal.changeSet.map((_, i) => i).filter(i => !declined.has(i));
    if (selected.length === 0) return void toast.danger('Select at least one operation to apply');
    const opIndexes = selected.length === proposal.changeSet.length ? undefined : selected;
    apply.mutate(
      { proposalId: proposal.id, opIndexes },
      {
        onSuccess: r => {
          const failed = r.opResults.filter(o => o.status === 'failed');
          if (failed.length > 0) toast.danger(`Applied with ${failed.length} failed action(s) — see the op results`);
          else toast.success(opIndexes ? `Applied ${opIndexes.length} of ${proposal.changeSet.length} ops` : 'Applied to canon');
        },
        onError: err => toast.danger(err.message),
      },
    );
  };
  const doDiscard = (): void => {
    discard.mutate(proposal.id, { onSuccess: () => toast.success('Proposal discarded'), onError: err => toast.danger(err.message) });
  };
  const doRevert = (): void => {
    revert.mutate(proposal.id, {
      onSuccess: r => toast.success(`Reverted ${r.reverted.length} artifact(s)`),
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <div className={`nf-scroll ${styles.detailScroll}`}>
      <div className={styles.detailInner}>
        <div className={styles.metaRow}>
          <StatusChip intent={statusIntent(proposal.status)}>{proposal.status}</StatusChip>
          <StatusChip intent="neutral">{proposal.kind}</StatusChip>
          <StatusChip intent="neutral">{proposal.scopeType}</StatusChip>
          {proposal.autoApplied && <StatusChip intent="info">auto</StatusChip>}
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
          {isPending && ' · untick to decline'}
        </div>
        <div className={styles.changeSet}>
          {proposal.changeSet.map((op, i) => {
            const result = opResults.find(r => r.index === i);
            return (
              <div key={i} className={styles.opRow} data-declined={declined.has(i)}>
                <div className={styles.opHead}>
                  {isPending && <Checkbox checked={!declined.has(i)} onCheckedChange={() => toggleOp(i)} aria-label={`include ${opLabel(op)}`} />}
                  <span className={styles.opLabel}>{opLabel(op)}</span>
                  {String(op.op).startsWith('action.') && <StatusChip intent="info">action</StatusChip>}
                  <div className={styles.spacer} />
                  {result && <StatusChip intent={OP_RESULT_INTENT[result.status] ?? 'neutral'}>{result.status}</StatusChip>}
                </div>
                <ChangeOpBody op={op} />
                {result?.error && <div className={styles.opError}>{result.error}</div>}
                {result?.result?.summary !== undefined && <div className={styles.opSummary}>{String(result.result.summary)}</div>}
              </div>
            );
          })}
        </div>

        {isPending && (
          <div className={styles.actions}>
            <Button variant="primary" loading={apply.isPending} onClick={doApply}>
              {declined.size > 0 ? `Apply ${proposal.changeSet.length - declined.size} selected` : 'Apply to canon'}
            </Button>
            <Button variant="ghost" loading={discard.isPending} onClick={doDiscard}>
              Discard
            </Button>
          </div>
        )}
        {isApplied && proposal.revertible && (
          <div className={styles.actions}>
            <Button variant="danger" loading={revert.isPending} onClick={doRevert}>
              Revert this change
            </Button>
            <p className={styles.statusNote}>Applied{proposal.appliedAt ? ` ${relativeTime(proposal.appliedAt)}` : ''} — reverting restores every touched artifact.</p>
          </div>
        )}
        {isApplied && !proposal.revertible && (
          <p className={styles.statusNote}>Applied{proposal.appliedAt ? ` ${relativeTime(proposal.appliedAt)}` : ''} — no inverse recorded, so this change cannot be reverted.</p>
        )}
        {!isPending && !isApplied && (
          <p className={styles.statusNote}>
            This proposal is {proposal.status}
            {proposal.revertedAt ? ` · reverted ${relativeTime(proposal.revertedAt)}` : proposal.appliedAt ? ` · ${relativeTime(proposal.appliedAt)}` : ''}.
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
                {proposal.autoApplied && <StatusChip intent="info">auto</StatusChip>}
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
