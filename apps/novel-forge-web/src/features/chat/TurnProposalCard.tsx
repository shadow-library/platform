import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Checkbox, toast } from '@shadow-library/ui';

import { ProposalsIcon } from '@/components/icons';
import { type ChipIntent, RegenerateAppliedBriefs, StatusChip } from '@/components/nf';
import { ChangeOpBody, PluginSourceChip } from '@/features/proposals';
import { type ApplyProposalResponse, type ProposalResponse, useApplyProposalMutation, useDiscardProposalMutation, useRevertProposalMutation } from '@/lib/apis';
import { appliedBriefChapters } from '@/lib/chapter-brief';
import { defaultDeclined, isGuardedOp, NEVER_AUTO_NOTE, opLabel } from '@/lib/proposals';

import { finalizeReviewBlocked, finalizeReviewChapter } from './chat-view';
import styles from './Chat.module.css';

const OP_RESULT_INTENT: Record<string, ChipIntent> = {
  applied: 'success',
  declined: 'neutral',
  failed: 'danger',
  pending: 'warning',
};

export interface TurnProposalCardProps {
  novelId: string;
  proposal: ProposalResponse;
  onApplied?: (result: ApplyProposalResponse) => void;
}

interface FinalizeRefusal {
  /** The chapter the action named; absent when the server picked one on its own and the client has no way to know which. */
  chapter?: number;
}

/** The explicit per-op card: kept for one-way doors, conflicts and anything the transcript has no friendlier view of. */
export function TurnProposalCard({ novelId, proposal, onApplied }: TurnProposalCardProps): React.JSX.Element {
  const apply = useApplyProposalMutation(novelId);
  const discard = useDiscardProposalMutation(novelId);
  const revert = useRevertProposalMutation(novelId);
  const [declined, setDeclined] = useState<Set<number>>(() => defaultDeclined(proposal.changeSet));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [finalizeRefusal, setFinalizeRefusal] = useState<FinalizeRefusal>();

  // The selection is keyed to one proposal's op indexes, so a different proposal in the same slot resets
  // it during render rather than in an effect — an effect would paint one frame of the old selection.
  const [selectionFor, setSelectionFor] = useState(proposal.id);
  if (selectionFor !== proposal.id) {
    setSelectionFor(proposal.id);
    setDeclined(defaultDeclined(proposal.changeSet));
    setFinalizeRefusal(undefined);
  }

  const isPending = proposal.status === 'pending';
  const opResults = proposal.opResults ?? [];
  const regenerateChapters = appliedBriefChapters(proposal);

  const toggle = (set: Set<number>, index: number, update: (next: Set<number>) => void): void => {
    const next = new Set(set);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    update(next);
  };

  const doApply = (): void => {
    const selected = proposal.changeSet.map((_, i) => i).filter(i => !declined.has(i));
    if (selected.length === 0) return void toast.danger('Select at least one operation to apply');
    setFinalizeRefusal(undefined);
    // Always explicit: a blanket apply (no `opIndexes`) is refused outright when the change-set holds a
    // one-way door, so naming the indexes is what makes finalize reachable at all.
    apply.mutate(
      { proposalId: proposal.id, opIndexes: selected },
      {
        onSuccess: r => {
          onApplied?.(r);
          const failed = r.opResults.filter(o => o.status === 'failed');
          if (failed.length > 0) toast.danger(`Applied with ${failed.length} failed action(s)`);
          else toast.success('Changes applied to canon');
        },
        onError: err => {
          const finalizeOp = proposal.changeSet.find(op => finalizeReviewBlocked(op, err.code));
          if (finalizeOp) return setFinalizeRefusal({ chapter: finalizeReviewChapter(finalizeOp) });
          toast.danger(err.message);
        },
      },
    );
  };

  return (
    <div className={styles.turnCard} data-status={proposal.status}>
      <div className={styles.cardHead}>
        <ProposalsIcon size={14} />
        <span className={styles.cardTitle}>
          {proposal.changeSet.length} change{proposal.changeSet.length === 1 ? '' : 's'}
        </span>
        <StatusChip intent={proposal.status === 'applied' ? 'success' : proposal.status === 'pending' ? 'warning' : proposal.status === 'conflicted' ? 'danger' : 'neutral'}>
          {proposal.status}
        </StatusChip>
        <PluginSourceChip proposal={proposal} />
        {proposal.autoApplied && <StatusChip intent="info">auto</StatusChip>}
      </div>

      <div className={styles.turnOps}>
        {proposal.changeSet.map((op, i) => {
          const result = opResults.find(r => r.index === i);
          const isAction = String(op.op).startsWith('action.');
          return (
            <div key={i} className={styles.turnOp} data-declined={declined.has(i)}>
              <div className={styles.turnOpRow}>
                {isPending && <Checkbox checked={!declined.has(i)} onCheckedChange={() => toggle(declined, i, setDeclined)} aria-label={`include ${opLabel(op)}`} />}
                <button type="button" className={styles.turnOpLabel} aria-expanded={expanded.has(i)} onClick={() => toggle(expanded, i, setExpanded)}>
                  {opLabel(op)}
                </button>
                {isAction && <StatusChip intent="info">action</StatusChip>}
                {result && (
                  <span className={styles.pushEnd}>
                    <StatusChip intent={OP_RESULT_INTENT[result.status] ?? 'neutral'}>{result.status}</StatusChip>
                  </span>
                )}
              </div>
              {isPending && isGuardedOp(op) && <div className={styles.turnOpNote}>{NEVER_AUTO_NOTE}</div>}
              {expanded.has(i) && <ChangeOpBody op={op} />}
              {result?.error && <div className={styles.turnOpError}>{result.error}</div>}
              {result?.result?.summary !== undefined && <div className={styles.turnOpSummary}>{String(result.result.summary)}</div>}
            </div>
          );
        })}
      </div>

      {proposal.warnings.map(warning => (
        <div key={warning} className={styles.turnCardWarning}>
          {warning}
        </div>
      ))}
      {proposal.status === 'conflicted' && <div className={styles.turnCardNote}>The canon moved on since this was drafted — ask again for a fresh change-set.</div>}
      {finalizeRefusal && (
        <>
          <div className={styles.turnCardNote}>The finalize review for this chapter isn’t ready or fully answered yet.</div>
          <div className={styles.cardActions}>
            <Button asChild size="sm" variant="secondary">
              <Link to="/novels/$novelId/chapters" params={{ novelId }} search={finalizeRefusal.chapter !== undefined ? { chapter: finalizeRefusal.chapter } : {}}>
                {finalizeRefusal.chapter !== undefined ? 'Open the finalize review' : 'Open Chapters to answer the finalize review'}
              </Link>
            </Button>
          </div>
        </>
      )}
      {regenerateChapters.length > 0 && (
        <div className={styles.cardActions}>
          <RegenerateAppliedBriefs novelId={novelId} chapters={regenerateChapters} />
        </div>
      )}
      {(isPending || proposal.revertible) && (
        <div className={styles.cardActions}>
          {isPending && (
            <>
              <Button size="sm" variant="primary" loading={apply.isPending} onClick={doApply}>
                {declined.size > 0 ? `Apply ${proposal.changeSet.length - declined.size} selected` : 'Apply'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={discard.isPending}
                onClick={() => discard.mutate(proposal.id, { onSuccess: () => toast.success('Declined'), onError: err => toast.danger(err.message) })}
              >
                Decline all
              </Button>
            </>
          )}
          {proposal.revertible && (
            <Button
              size="sm"
              variant="danger"
              loading={revert.isPending}
              onClick={() =>
                revert.mutate(proposal.id, {
                  onSuccess: r => toast.success(`Reverted ${r.reverted.length} artifact(s)`),
                  onError: err => toast.danger(err.message),
                })
              }
            >
              Revert
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
