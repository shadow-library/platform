import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from '@shadow-library/ui';

import { type ApplyProposalResponse, cachedProposal, type ProposalResponse, useApplyProposalMutation, useDiscardProposalMutation } from '@/lib/apis';

import { type SuggestionCommit, suggestionCommit, type SuggestionDecision } from './chat-view';
import { answersSettled, currentAnswers, type SuggestionAnswers, updateAnswers, useSuggestionAnswers, writeAnswers } from './suggestion-store';

export interface SuggestionAnswering {
  answers: SuggestionAnswers;
  decide: (index: number, decision: SuggestionDecision | undefined) => void;
  /** Answers every unanswered suggestion with add, then commits the card. */
  addAll: () => void;
  commit: (force?: boolean) => void;
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
  const answers = useSuggestionAnswers(proposal.id);
  const total = proposal.changeSet.length;
  const finished = answersSettled(proposal.status, proposal.changeSet, answers.decisions, answers.scopes);

  useEffect(() => {
    writeAnswers(proposal.id, finished ? { decisions: [], scopes: [] } : { decisions: [...answers.decisions.entries()], scopes: [...answers.scopes.entries()] });
  }, [answers.decisions, answers.scopes, finished, proposal.id]);

  const settle = (error?: string): void => updateAnswers(proposal.id, current => ({ ...current, committing: false, error }));

  const commitWith = async (decisions: ReadonlyMap<number, SuggestionDecision>, force: boolean): Promise<void> => {
    const status = (cachedProposal(queryClient, novelId, proposal.id) ?? proposal).status;
    const plan = plannedCommit({ status, committing: currentAnswers(proposal.id).committing, total, decisions, force });
    if (plan.kind === 'wait') return;
    updateAnswers(proposal.id, current => ({ ...current, committing: true, error: undefined }));
    try {
      if (plan.kind === 'discard') {
        await discard.mutateAsync(proposal.id);
      } else {
        const result = await apply.mutateAsync({ proposalId: proposal.id, opIndexes: plan.opIndexes });
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
    const next = new Map(currentAnswers(proposal.id).decisions);
    for (let index = 0; index < total; index++) if (!next.has(index)) next.set(index, 'add');
    updateAnswers(proposal.id, current => ({ ...current, decisions: next }));
    void commitWith(next, false);
  };

  return { answers, decide, addAll, commit: (force = false) => void commitWith(currentAnswers(proposal.id).decisions, force) };
}
