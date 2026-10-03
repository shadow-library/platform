import { type OpType } from './change-set';

/** Ops that replace or remove a chapter's prose instead of running it back through the generation pipeline. */
export const PROSE_EDIT_OPS: readonly OpType[] = ['draft.update', 'draft.remove', 'draft.rewrite_passage', 'action.revise_draft'];

export const PROSE_EDIT_WITHHELD_NOTE =
  "Forge left the chapter's prose untouched because Edit prose was off for this request: apply the plan change, then regenerate the chapter from the updated brief. To have Forge rewrite the text itself, turn on Edit prose and ask again.";

export const PASSAGE_EDIT_WITHHELD_NOTE =
  'Forge left the passage as it is because Edit prose was off for this request. To have Forge rewrite it, turn on Edit prose and ask again.';

const DEPENDENT_CHAPTER_ACTIONS = new Set(['action.approve_draft', 'action.judge_draft']);

interface OpLike {
  op?: unknown;
  chapter?: unknown;
  upTo?: unknown;
}

export function isProseEditOp(op: OpLike): boolean {
  return PROSE_EDIT_OPS.includes(op.op as OpType);
}

/** An action that only makes sense on top of the withheld prose: judging or approving that chapter, or finalizing through it. */
function dependsOnWithheld(op: OpLike, chapters: ReadonlySet<number>): boolean {
  if (DEPENDENT_CHAPTER_ACTIONS.has(op.op as string)) return typeof op.chapter === 'number' && chapters.has(op.chapter);
  if (op.op !== 'action.finalize' || chapters.size === 0) return false;
  return typeof op.upTo !== 'number' || [...chapters].some(chapter => chapter <= (op.upTo as number));
}

function proseEditIssue(op: OpLike, index: number): string {
  if (op.op === 'draft.rewrite_passage')
    return `changeSet[${index}]: draft.rewrite_passage needs Edit prose, which is off — drop it, say in the reply what you would change, and suggest turning on Edit prose; never turn a passage comment into a brief.update.`;
  return `changeSet[${index}]: ${String(op.op)} changes the chapter's prose, but the author did not turn on Edit prose — a plan edit stays a plan edit. Propose brief.update (or the other plan ops) instead, and tell the author they can regenerate the chapter from the updated brief.`;
}

export function proseEditIssues(changeSet: readonly Record<string, unknown>[] | undefined): string[] {
  return (changeSet ?? []).flatMap((op, index) => (isProseEditOp(op) ? [proseEditIssue(op, index)] : []));
}

/** What the reply says about prose it withheld: a passage left alone when every withheld op was a passage rewrite, a plan to regenerate from otherwise. */
export function proseWithheldNote(changeSet: readonly Record<string, unknown>[]): string {
  const withheld = changeSet.filter(isProseEditOp);
  return withheld.length > 0 && withheld.every(op => op.op === 'draft.rewrite_passage') ? PASSAGE_EDIT_WITHHELD_NOTE : PROSE_EDIT_WITHHELD_NOTE;
}

export function withoutProseEditOps<T extends OpLike>(changeSet: readonly T[]): { kept: T[]; withheld: number } {
  const withheldChapters = new Set(changeSet.filter(isProseEditOp).flatMap(op => (typeof op.chapter === 'number' ? [op.chapter] : [])));
  const kept = changeSet.filter(op => !isProseEditOp(op) && !dependsOnWithheld(op, withheldChapters));
  return { kept, withheld: changeSet.length - kept.length };
}
