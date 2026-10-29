import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { toast } from '@shadow-library/ui';

import {
  type ApplyProposalResponse,
  cachedProposal,
  type ProposalResponse,
  useApplyProposalMutation,
  useDiscardProposalMutation,
  useListAuditsQuery,
  useRejectProposalOpMutation,
} from '@/lib/apis';
import { auditApplyIndexes, auditSkippedOps, findAuditReportByProposal } from '@/lib/bible-audit';

import { answeredInPanel, organisePage, type RejectionScope, rejectionWhy, type SuggestionCommit, suggestionCommit, type SuggestionDecision, withAuditSkips } from './chat-view';
import { answersSettled, currentAnswers, type SuggestionAnswers, updateAnswers, useSuggestionAnswers, writeAnswers } from './suggestion-store';

export interface SuggestionAnswering {
  answers: SuggestionAnswers;
  decide: (index: number, decision: SuggestionDecision | undefined) => void;
  /** Answers every unanswered suggestion with add, then commits the card. */
  addAll: () => void;
  commit: (force?: boolean) => void;
  /** Records when a declined suggestion may be suggested again. */
  remember: (index: number, scope: RejectionScope) => void;
  remembering: boolean;
}

export interface CommitCheck {
  /** The card's status as the cache holds it now: another place showing the card may already have committed it. */
  status: string;
  committing: boolean;
  total: number;
  decisions: ReadonlyMap<number, SuggestionDecision>;
  force: boolean;
}

/** What committing now would do; a card already settled, or with a commit in flight elsewhere, waits. */
export function plannedCommit({ status, committing, total, decisions, force }: CommitCheck): SuggestionCommit {
  if (status !== 'pending' || committing) return { kind: 'wait' };
  return suggestionCommit(total, decisions, force);
}

/**
 * Undefined for a card answered on its own card in the thread. An organise card offers a mixed page twice, its notes-backed half before the whole,
 * and refuses keeping both (NTS_007): Add all keeps the later one unless the author already picked one, and leaves the other out unanswered.
 */
export function addAllDecisions(
  proposal: Pick<ProposalResponse, 'kind' | 'changeSet'>,
  decisions: ReadonlyMap<number, SuggestionDecision>,
): ReadonlyMap<number, SuggestionDecision> | undefined {
  if (!answeredInPanel(proposal)) return undefined;
  const next = new Map(decisions);
  const kept = new Set([...decisions].flatMap(([index, decision]) => (decision === 'add' ? [organisePage(proposal, index)] : [])));
  for (let index = proposal.changeSet.length - 1; index >= 0; index--) {
    if (next.has(index)) continue;
    const page = organisePage(proposal, index);
    if (page !== undefined && kept.has(page)) continue;
    kept.add(page);
    next.set(index, 'add');
  }
  return next;
}

const NO_SKIPS: ReadonlySet<number> = new Set();

/** The ops of an audit card the author skipped in the audit's own answers; none for any other card. */
export function useAuditSkippedOps(novelId: string, proposal: Pick<ProposalResponse, 'id' | 'kind' | 'changeSet'>): ReadonlySet<number> {
  const audit = proposal.kind === 'bible_audit';
  const audits = useListAuditsQuery(novelId, audit);
  const total = proposal.changeSet.length;
  return useMemo(() => (audit ? auditSkippedOps(findAuditReportByProposal(audits.data, proposal.id), total) : NO_SKIPS), [audit, audits.data, proposal.id, total]);
}

export interface SuggestionAnsweringOptions {
  onApplied?: (result: ApplyProposalResponse) => void;
  onCommitted?: () => void;
}

/**
 * A card's answers and its commit, shared by every place that shows the card. The commit awaits its mutation rather than using per-call
 * callbacks, which never fire once the caller unmounts — the panel's sheet can close mid-commit, and the card would read "adding" forever.
 */
export function useSuggestionAnswering(novelId: string, proposal: ProposalResponse, options: SuggestionAnsweringOptions = {}): SuggestionAnswering {
  const queryClient = useQueryClient();
  const apply = useApplyProposalMutation(novelId);
  const discard = useDiscardProposalMutation(novelId);
  const reject = useRejectProposalOpMutation(novelId);
  const stored = useSuggestionAnswers(proposal.id);
  const skipped = useAuditSkippedOps(novelId, proposal);
  const answers = useMemo(() => ({ ...stored, decisions: withAuditSkips(stored.decisions, skipped) }), [stored, skipped]);
  const total = proposal.changeSet.length;
  const finished = answersSettled(proposal.status, proposal.changeSet, stored.decisions, stored.scopes);

  useEffect(() => {
    writeAnswers(proposal.id, finished ? { decisions: [], scopes: [] } : { decisions: [...stored.decisions.entries()], scopes: [...stored.scopes.entries()] });
  }, [stored.decisions, stored.scopes, finished, proposal.id]);

  const settle = (error?: string): void => updateAnswers(proposal.id, current => ({ ...current, committing: false, error }));

  const commitWith = async (answered: ReadonlyMap<number, SuggestionDecision>, force: boolean): Promise<void> => {
    const decisions = withAuditSkips(answered, skipped);
    const status = (cachedProposal(queryClient, novelId, proposal.id) ?? proposal).status;
    const plan = plannedCommit({ status, committing: currentAnswers(proposal.id).committing, total, decisions, force });
    if (plan.kind === 'wait') return;
    updateAnswers(proposal.id, current => ({ ...current, committing: true, error: undefined }));
    try {
      if (plan.kind === 'discard') {
        await discard.mutateAsync(proposal.id);
      } else {
        const result = await apply.mutateAsync({ proposalId: proposal.id, opIndexes: auditApplyIndexes(proposal, plan.opIndexes, skipped) });
        options.onApplied?.(result);
        const failed = result.opResults.filter(op => op.status === 'failed');
        if (failed.length > 0) toast.danger(`${failed.length} couldn’t be added: ${failed[0]?.error ?? 'the Story Bible refused it'}`);
      }
      settle();
      options.onCommitted?.();
    } catch (err) {
      settle(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const decide = (index: number, decision: SuggestionDecision | undefined): void => {
    const next = new Map(currentAnswers(proposal.id).decisions);
    if (decision) next.set(index, decision);
    else next.delete(index);
    updateAnswers(proposal.id, current => ({ ...current, decisions: next }));
    if (decision) void commitWith(next, false);
  };

  const addAll = (): void => {
    const next = addAllDecisions(proposal, withAuditSkips(currentAnswers(proposal.id).decisions, skipped));
    if (!next) return;
    updateAnswers(proposal.id, current => ({ ...current, decisions: next }));
    void commitWith(next, true);
  };

  const remember = async (index: number, scope: RejectionScope): Promise<void> => {
    if (!proposal.changeSet[index]) return;
    try {
      await reject.mutateAsync({ proposalId: proposal.id, opIndex: index, scope, why: rejectionWhy(scope) });
      updateAnswers(proposal.id, current => ({ ...current, scopes: new Map(current.scopes).set(index, scope) }));
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : 'Couldn’t save that.');
    }
  };

  return {
    answers,
    decide,
    addAll,
    commit: (force = false) => void commitWith(currentAnswers(proposal.id).decisions, force),
    remember: (index, scope) => void remember(index, scope),
    remembering: reject.isPending,
  };
}
