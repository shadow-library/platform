export type NextStepScreen = 'chapters' | 'review' | 'chat';

export interface NextStepTarget {
  screen: NextStepScreen;
  chapter?: number;
  /** Open the chapter straight into its review drawer instead of the read view. */
  review?: boolean;
}

export type NextStepId = 'repair-chapter' | 'review-queue' | 'build-plan' | 'generate-chapter' | 'finalize-chapters';

export interface NextStepAction {
  id: NextStepId;
  label: string;
  reason: string;
  target: NextStepTarget;
}

export interface ComingUpItem {
  id: NextStepId;
  label: string;
}

export interface NextStepResult {
  next?: NextStepAction;
  comingUp: ComingUpItem[];
}

export interface NextStepInput {
  volumesTotal: number;
  draftsTotal: number;
  draftsFinal: number;
  /** Outlined chapters (briefs) that have no draft yet. */
  briefsRemaining: number;
  /** Chapter number of the lowest un-drafted brief, when known. */
  nextBriefChapter?: number;
  /** Chapter number of the lowest draft the judge flagged as contradicting the bible. */
  contradictedChapter?: number;
  /** Queued drafts, plus pending continuity and refinement proposals — the Review Queue's own count. */
  reviewQueueCount: number;
  /** Drafted-but-not-final chapters, formatted as e.g. "1–3, 5" — the chapters finalizing would lock in. */
  notFinalChapterRange?: string;
  /** The lowest drafted chapter that is not final — chapters finalize in order, so the one whose Finalize review comes next. */
  nextFinalizeChapter?: number;
}

interface NextStepRule {
  id: NextStepId;
  /** Position in the bible → draft → finalize roadmap; interrupts (repair/review) have none. */
  roadmapIndex?: number;
  test(input: NextStepInput): boolean;
  build(input: NextStepInput): NextStepAction;
  comingUpLabel: string;
}

const RULES: readonly NextStepRule[] = [
  {
    id: 'repair-chapter',
    test: input => input.contradictedChapter != null,
    build: input => ({
      id: 'repair-chapter',
      label: `Repair chapter ${input.contradictedChapter}`,
      reason: 'The judge flagged this chapter as contradicting the bible.',
      target: { screen: 'chapters', chapter: input.contradictedChapter, review: true },
    }),
    comingUpLabel: 'Repair the flagged chapter',
  },
  {
    id: 'review-queue',
    test: input => input.reviewQueueCount > 0,
    build: input => ({
      id: 'review-queue',
      label: `Review ${input.reviewQueueCount} item${input.reviewQueueCount === 1 ? '' : 's'}`,
      reason: 'Drafts and proposals are waiting on your read.',
      target: { screen: 'review' },
    }),
    comingUpLabel: 'Clear the review queue',
  },
  {
    id: 'build-plan',
    roadmapIndex: 0,
    test: input => input.volumesTotal === 0,
    build: () => ({
      id: 'build-plan',
      label: 'Build your plan',
      reason: 'Nothing is outlined yet — ask the assistant to help build the Story Bible.',
      target: { screen: 'chat' },
    }),
    comingUpLabel: 'Build your plan',
  },
  {
    id: 'generate-chapter',
    roadmapIndex: 1,
    test: input => input.briefsRemaining > 0,
    build: input => ({
      id: 'generate-chapter',
      label: input.nextBriefChapter != null ? `Generate chapter ${input.nextBriefChapter}` : 'Generate the next chapter',
      reason: `${input.briefsRemaining} outlined chapter${input.briefsRemaining === 1 ? ' is' : 's are'} waiting to be drafted.`,
      target: { screen: 'chapters', chapter: input.nextBriefChapter },
    }),
    comingUpLabel: 'Generate the next chapter',
  },
  {
    id: 'finalize-chapters',
    roadmapIndex: 2,
    test: input => input.draftsTotal > 0 && input.draftsFinal < input.draftsTotal && input.reviewQueueCount === 0 && input.briefsRemaining <= 0,
    build: input => ({
      id: 'finalize-chapters',
      label: input.nextFinalizeChapter != null ? `Finalize chapter ${input.nextFinalizeChapter}` : 'Finalize chapters',
      reason: finalizeReason(input.notFinalChapterRange),
      target: { screen: 'chapters', chapter: input.nextFinalizeChapter },
    }),
    comingUpLabel: 'Finalize chapters',
  },
];

function finalizeReason(range: string | undefined): string {
  if (!range) return 'Every drafted chapter is approved — finalize them in order, each through its Finalize review.';
  if (!/[,–]/.test(range)) return `Every drafted chapter is approved — finalize chapter ${range} through its Finalize review.`;
  return `Every drafted chapter is approved — finalize chapters ${range} in order, each through its Finalize review.`;
}

function hasRoadmapIndex(rule: NextStepRule): rule is NextStepRule & { roadmapIndex: number } {
  return rule.roadmapIndex !== undefined;
}

const ROADMAP = [...RULES].filter(hasRoadmapIndex).sort((a, b) => a.roadmapIndex - b.roadmapIndex);

/** Nothing is outlined: pad from the top of the roadmap; otherwise the next rung down is generating a chapter. */
function roadmapAnchorIndex(input: NextStepInput): number {
  return input.volumesTotal === 0 ? 0 : 1;
}

/**
 * The Overview "Next step" rule engine: evaluates the fixed priority order below against the project's
 * current state and returns the one action the author should take next, plus a short preview of what
 * follows. Priority (highest first): a contradicted draft, a non-empty review queue, an empty plan,
 * un-drafted briefs, then chapters awaiting finalize. `comingUp` prefers other rules that are
 * independently true right now (in priority order) and pads the rest from the roadmap stages ahead of
 * wherever the author actually is.
 */
export function computeNextStep(input: NextStepInput): NextStepResult {
  const evaluated = RULES.map(rule => ({ rule, isTrue: rule.test(input) }));
  const nextEntry = evaluated.find(entry => entry.isTrue);
  if (!nextEntry) return { comingUp: [] };

  const nextRuleIndex = RULES.indexOf(nextEntry.rule);
  const comingUp: ComingUpItem[] = [];
  const usedIds = new Set<NextStepId>([nextEntry.rule.id]);

  for (const { rule, isTrue } of evaluated.slice(nextRuleIndex + 1)) {
    if (!isTrue || usedIds.has(rule.id)) continue;
    comingUp.push({ id: rule.id, label: rule.build(input).label });
    usedIds.add(rule.id);
  }

  const startIndex = nextEntry.rule.roadmapIndex !== undefined ? nextEntry.rule.roadmapIndex + 1 : roadmapAnchorIndex(input);
  for (const rule of ROADMAP.slice(startIndex)) {
    if (comingUp.length >= 3) break;
    if (usedIds.has(rule.id)) continue;
    comingUp.push({ id: rule.id, label: rule.comingUpLabel });
    usedIds.add(rule.id);
  }

  return { next: nextEntry.rule.build(input), comingUp: comingUp.slice(0, 3) };
}

interface BriefLike {
  chapter: number;
}

interface ReviewDraftLike {
  chapter: number;
  reviewStatus: string;
}

interface DraftedChapterLike {
  chapter: number;
  status: string;
}

export interface NextStepStateInput {
  volumesTotal: number;
  draftsTotal: number;
  draftsFinal: number;
  briefs: readonly BriefLike[];
  /** Every project draft's chapter + status — the actual drafted set, not just a count. */
  draftedChapters: readonly DraftedChapterLike[];
  reviewDrafts: readonly ReviewDraftLike[];
  pendingContinuityCount: number;
  pendingRefinementCount: number;
}

/** Collapses sorted chapter numbers into runs, e.g. [1,2,3,5,6] -> "1–3, 5–6". */
function formatChapterRange(chapters: readonly number[]): string {
  const sorted = [...chapters].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start: number | undefined;
  let prev: number | undefined;
  for (const chapter of sorted) {
    if (start === undefined || prev === undefined) {
      start = chapter;
      prev = chapter;
      continue;
    }
    if (chapter === prev + 1) {
      prev = chapter;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = chapter;
    prev = chapter;
  }
  if (start !== undefined && prev !== undefined) ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
  return ranges.join(', ');
}

/**
 * Shapes the raw project/brief/draft/review-queue data the Overview screen already has into the rule
 * engine's input. Kept separate from `computeNextStep` so both halves stay independently testable.
 */
export function deriveNextStepInput(state: NextStepStateInput): NextStepInput {
  const draftedChapterSet = new Set(state.draftedChapters.map(draft => draft.chapter));
  const undraftedBriefChapters = state.briefs
    .map(brief => brief.chapter)
    .filter(chapter => !draftedChapterSet.has(chapter))
    .sort((a, b) => a - b);
  const briefsRemaining = undraftedBriefChapters.length;
  const nextBriefChapter = undraftedBriefChapters[0];

  const notFinalChapters = state.draftedChapters.filter(draft => draft.status !== 'final').map(draft => draft.chapter);
  const notFinalChapterRange = notFinalChapters.length > 0 ? formatChapterRange(notFinalChapters) : undefined;

  const contradictedChapter = state.reviewDrafts
    .filter(draft => draft.reviewStatus === 'contradiction')
    .map(draft => draft.chapter)
    .sort((a, b) => a - b)[0];

  return {
    volumesTotal: state.volumesTotal,
    draftsTotal: state.draftsTotal,
    draftsFinal: state.draftsFinal,
    briefsRemaining,
    nextBriefChapter,
    contradictedChapter,
    reviewQueueCount: state.reviewDrafts.length + state.pendingContinuityCount + state.pendingRefinementCount,
    notFinalChapterRange,
    nextFinalizeChapter: notFinalChapters.length > 0 ? Math.min(...notFinalChapters) : undefined,
  };
}
