import { AppError } from '@shadow-library/common';

import { type DbExecutor, type Refinement } from '@server/database';

import { loadCurrentRecords } from './artifact-state';
import { type ChangeOp, changeSetRefs } from './change-set';
import { type ApplyResult } from './proposal-apply.service';
import { type ChangeSetSplit, splitChangeSet } from './write-policy';

export const HELD_FOR_REVIEW_NOTE = 'Not applied automatically: review the warnings on these suggestions first.';
export const APPLY_FAILED_NOTE = 'Your words could not be applied as they stand, so every change is offered as a suggestion instead.';
export const UNLINKED_NOTE = 'Your words were applied, but this reply could not be linked to them — find the change in Change history to undo it.';
export const CARDS_UNSAVED_NOTE = 'Your words were applied, but the suggestions that came with them could not be saved — ask again to see them.';

export interface StageOptions {
  /** Off for one half of a split: the whole change-set already passed the entity-materialization check, and a half may lean on the other's records. */
  entityMaterialization: boolean;
}

export interface TurnProposalPort {
  stage: (changeSet: ChangeOp[], warnings: string[], options: StageOptions) => Promise<Refinement.Proposal>;
  apply: (proposalId: bigint) => Promise<ApplyResult>;
  /** Called as soon as the apply commits, so the turn keeps its link to the applied change whatever happens to the cards. */
  linkApplied: (proposal: Refinement.Proposal) => Promise<unknown>;
  discard: (proposalId: bigint) => Promise<unknown>;
}

export interface TurnStaging {
  /** "From your words": the quote-backed ops, already applied, undone by reverting this proposal. */
  appliedProposal: Refinement.Proposal | null;
  applied?: Pick<ApplyResult, 'applied' | 'staleMarked' | 'opResults'>;
  /** "Suggestions": everything else, pending the author's per-op accept or decline. */
  cardProposal: Refinement.Proposal | null;
  applyNote?: string;
}

export interface TurnPolicyContext {
  authorMessage: string;
  mode: Refinement.ChatMode;
  justDiscussing: boolean;
  warnings: readonly string[];
}

/** The quote rule over the records as they stand when the turn stages, not when it started — a long turn may overlap other writes. */
export async function splitTurnChangeSet(db: DbExecutor, projectId: bigint, ops: readonly ChangeOp[], context: TurnPolicyContext): Promise<ChangeSetSplit> {
  const current = await loadCurrentRecords(db, projectId, changeSetRefs([...ops]));
  return splitChangeSet({
    ops,
    authorMessage: context.authorMessage,
    mode: context.mode,
    justDiscussing: context.justDiscussing,
    held: context.warnings.length > 0,
    state: { current },
  });
}

function failureNote(err: unknown): string {
  return AppError.is(err) ? err.message : APPLY_FAILED_NOTE;
}

/**
 * Stages a turn's split as at most two proposals. The applied side goes first so the cards' baseline is taken after it — a card may name a
 * record the applied side created. Anything that stops the applied side (a warning of its own, a conflict, a refused write) turns the whole
 * change-set back into cards, so the author never loses an op to a failed apply.
 */
export async function stageTurnChangeSet(port: TurnProposalPort, split: ChangeSetSplit, warnings: string[]): Promise<TurnStaging> {
  const whole: StageOptions = { entityMaterialization: true };
  const half: StageOptions = { entityMaterialization: split.direct.length === 0 || split.cards.length === 0 };
  // Staging re-runs its own checks over the whole change-set, so a warning the direct side raised comes back on the cards without being passed on.
  const allAsCards = async (applyNote: string): Promise<TurnStaging> => ({ appliedProposal: null, cardProposal: await port.stage(split.ops, warnings, whole), applyNote });

  if (split.direct.length === 0) {
    const cardProposal = split.cards.length > 0 ? await port.stage(split.cards, warnings, whole) : null;
    return { appliedProposal: null, cardProposal, applyNote: split.held ? HELD_FOR_REVIEW_NOTE : undefined };
  }

  let staged: Refinement.Proposal;
  try {
    staged = await port.stage(split.direct, [], half);
  } catch (err) {
    return allAsCards(failureNote(err));
  }
  if ((staged.warnings?.length ?? 0) > 0) {
    await port.discard(staged.id);
    return allAsCards(HELD_FOR_REVIEW_NOTE);
  }

  let result: ApplyResult;
  try {
    result = await port.apply(staged.id);
  } catch (err) {
    await port.discard(staged.id);
    return allAsCards(failureNote(err));
  }
  const linked = await port.linkApplied(result.proposal).then(
    () => true,
    () => false,
  );

  const applied = { applied: result.applied, staleMarked: result.staleMarked, opResults: result.opResults };
  const unlinkedNote = linked ? undefined : UNLINKED_NOTE;
  if (split.cards.length === 0) return { appliedProposal: result.proposal, applied, cardProposal: null, applyNote: unlinkedNote };
  try {
    return { appliedProposal: result.proposal, applied, cardProposal: await port.stage(split.cards, warnings, half), applyNote: unlinkedNote };
  } catch {
    return { appliedProposal: result.proposal, applied, cardProposal: null, applyNote: [unlinkedNote, CARDS_UNSAVED_NOTE].filter(Boolean).join(' ') };
  }
}
