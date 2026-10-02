import { AppError } from '@shadow-library/common';

import { type DbExecutor, type Refinement } from '@server/database';

import { loadCurrentRecords } from './artifact-state';
import { type ChangeOp, changeSetRefs } from './change-set';
import { dropRejectedIdeas, filterableIdeaIds } from './idea-filter';
import { PLANNER_ONLY_WARNING } from './planner-only-guard';
import { type ApplyResult, type OpResult } from './proposal-apply.service';
import { type ChangeSetSplit, type OpSource, splitChangeSet, type WriteHold } from './write-policy';

export const HELD_FOR_REVIEW_NOTE = 'Not applied automatically: review the warnings on these suggestions first.';
export const WRITER_READ_HELD_NOTE = 'Changes the chapter writer reads wait for your review, because this turn drew on your notes.';
export const APPLY_FAILED_NOTE = 'Your words could not be applied as they stand, so every change is offered as a suggestion instead.';
export const UNLINKED_NOTE = 'Your words were applied, but this reply could not be linked to them — find the change in Change history to undo it.';
export const CARDS_UNSAVED_NOTE = 'Your words were applied, but the suggestions that came with them could not be saved — ask again to see them.';
export const IDEAS_DROPPED_NOTE = 'Suggestions you turned down earlier were left out.';

export const TURN_HOLD_REASONS = ['warnings', 'planner_sources'] as const;
/** Why a turn's cards wait: `warnings` on the turn or its applied side, or `planner_sources` — it drew on the notes or a planner-only page. */
export type TurnHoldReason = (typeof TURN_HOLD_REASONS)[number];

const HOLD_NOTES: Readonly<Record<Exclude<WriteHold, 'none'>, { note: string; reason: TurnHoldReason }>> = {
  turn: { note: HELD_FOR_REVIEW_NOTE, reason: 'warnings' },
  writer_read: { note: WRITER_READ_HELD_NOTE, reason: 'planner_sources' },
};

export interface StageOptions {
  /** Off for one half of a split: the whole change-set already passed the entity-materialization check, and a half may lean on the other's records. */
  entityMaterialization: boolean;
}

export interface TurnProposalPort {
  stage: (changeSet: ChangeOp[], warnings: string[], options: StageOptions) => Promise<Refinement.Proposal>;
  /** `sources` holds the write policy's source for each op of the staged change-set, kept on the applied proposal's results. */
  apply: (proposalId: bigint, sources: readonly OpSource[]) => Promise<ApplyResult>;
  /** Called as soon as the apply commits, so the turn keeps its link to the applied change whatever happens to the cards. */
  linkApplied: (proposal: Refinement.Proposal) => Promise<unknown>;
  discard: (proposalId: bigint) => Promise<unknown>;
}

export interface TurnOpResult extends OpResult {
  source: OpSource;
}

export interface TurnApplied extends Pick<ApplyResult, 'applied' | 'staleMarked'> {
  opResults: TurnOpResult[];
}

export interface TurnStaging {
  /** The ops that applied in the turn — the author's words and, under Edit freely, the model's ideas — undone by reverting this proposal. */
  appliedProposal: Refinement.Proposal | null;
  applied?: TurnApplied;
  /** "Suggestions": everything else, pending the author's per-op accept or decline. */
  cardProposal: Refinement.Proposal | null;
  applyNote?: string;
  /** Set when a hold kept ops that would have applied among the cards. */
  held?: TurnHoldReason;
}

export interface TurnPolicyContext {
  authorMessage: string;
  mode: Refinement.ChatMode;
  justDiscussing: boolean;
  warnings: readonly string[];
  /** Which of these ideas the author turned down in a scope that still holds; when it fails, no idea applies, since none can be checked. */
  rejectedIdeas?: (ideaIds: string[]) => Promise<ReadonlySet<string>>;
}

export interface TurnSplit extends ChangeSetSplit {
  /** Ideas left out because the author turned them down, or because they leaned on one that was. */
  droppedIdeas: string[];
}

/** Reading the notes or a planner-only page holds only what the chapter writer reads; any other warning holds the whole turn. */
export function turnHold(warnings: readonly string[]): WriteHold {
  if (warnings.length === 0) return 'none';
  return warnings.every(warning => warning === PLANNER_ONLY_WARNING) ? 'writer_read' : 'turn';
}

/** The quote rule over the records as they stand when the turn stages, not when it started — a long turn may overlap other writes. */
export async function splitTurnChangeSet(db: DbExecutor, projectId: bigint, ops: readonly ChangeOp[], context: TurnPolicyContext): Promise<TurnSplit> {
  const current = await loadCurrentRecords(db, projectId, changeSetRefs([...ops]));
  const input = { ops, authorMessage: context.authorMessage, mode: context.mode, justDiscussing: context.justDiscussing, hold: turnHold(context.warnings), state: { current } };
  const split = splitChangeSet({ ...input, ideas: 'apply' });
  const candidates = filterableIdeaIds(split);
  if (!context.rejectedIdeas || candidates.length === 0) return { ...split, droppedIdeas: [] };
  const rejected = await context.rejectedIdeas(candidates).catch(() => null);
  if (!rejected) return { ...splitChangeSet({ ...input, ideas: 'card' }), droppedIdeas: [] };
  const filtered = dropRejectedIdeas(split, rejected, current);
  if (filtered.dropped.length === 0) return { ...filtered.split, droppedIdeas: [] };
  const held = splitChangeSet({ ...input, ops: filtered.split.ops, ideas: 'apply' }).held;
  return { ...filtered.split, held, droppedIdeas: filtered.dropped };
}

function sourceOf(split: ChangeSetSplit, index: number): OpSource {
  const source = split.sources[index];
  if (source === undefined) throw AppError.internal(`applied op ${index} has no source: the split's sources are misaligned with its applied side`);
  return source;
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

  if (split.sources.length !== split.direct.length) throw AppError.internal('a split carries one source per applied op');
  const hold = split.held === 'none' ? undefined : HOLD_NOTES[split.held];
  if (split.direct.length === 0) {
    const cardProposal = split.cards.length > 0 ? await port.stage(split.cards, warnings, whole) : null;
    return { appliedProposal: null, cardProposal, applyNote: hold?.note, ...(hold && { held: hold.reason }) };
  }

  let staged: Refinement.Proposal;
  try {
    staged = await port.stage(split.direct, [], half);
  } catch (err) {
    return allAsCards(failureNote(err));
  }
  if ((staged.warnings?.length ?? 0) > 0) {
    await port.discard(staged.id);
    return { ...(await allAsCards(HELD_FOR_REVIEW_NOTE)), held: 'warnings' };
  }

  let result: ApplyResult;
  try {
    result = await port.apply(staged.id, split.sources);
  } catch (err) {
    await port.discard(staged.id);
    return allAsCards(failureNote(err));
  }
  const linked = await port.linkApplied(result.proposal).then(
    () => true,
    () => false,
  );

  const opResults = result.opResults.map(opResult => ({ ...opResult, source: sourceOf(split, opResult.index) }));
  const applied = { applied: result.applied, staleMarked: result.staleMarked, opResults };
  const unlinkedNote = linked ? undefined : UNLINKED_NOTE;
  if (split.cards.length === 0) return { appliedProposal: result.proposal, applied, cardProposal: null, applyNote: unlinkedNote };
  try {
    const cardProposal = await port.stage(split.cards, warnings, half);
    const applyNote = [hold?.note, unlinkedNote].filter(Boolean).join(' ') || undefined;
    return { appliedProposal: result.proposal, applied, cardProposal, applyNote, ...(hold && { held: hold.reason }) };
  } catch {
    return { appliedProposal: result.proposal, applied, cardProposal: null, applyNote: [unlinkedNote, CARDS_UNSAVED_NOTE].filter(Boolean).join(' ') };
  }
}
