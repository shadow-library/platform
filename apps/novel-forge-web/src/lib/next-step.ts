import { type BlueprintStage } from '@/lib/apis';

export type NextStepScreen = 'blueprint' | 'story-bible' | 'volumes' | 'chapters' | 'review' | 'chat';

export interface NextStepTarget {
  screen: NextStepScreen;
  chapter?: number;
  volumeKey?: string;
  /** Open the chapter straight into its review drawer instead of the read view. */
  review?: boolean;
}

export type NextStepId =
  'continue-blueprint' | 'open-workspace' | 'repair-chapter' | 'review-queue' | 'build-plan' | 'approve-plan' | 'generate-chapter' | 'plan-next-arc' | 'finalize-chapters';

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
  /** Null for a project with no Blueprint at all; `blueprint` while the design is still being settled. */
  blueprintStage?: BlueprintStage | null;
  /** The phase the author is on, for the reason line. */
  blueprintPhaseLabel?: string;
  /** Every required step that applies is locked, so the only thing left in the Blueprint is the gate. */
  blueprintComplete?: boolean;
  volumesTotal: number;
  planApproved: boolean;
  draftsTotal: number;
  draftsFinal: number;
  /** Outlined chapters (briefs) that have no draft yet. */
  briefsRemaining: number;
  /** Chapter number of the lowest un-drafted brief, when known. */
  nextBriefChapter?: number;
  /** The approved plan still has chapter range the outlined briefs don't cover yet. */
  arcsLeft: boolean;
  /** Volume whose range still needs another arc outlined, when identifiable. */
  nextArcVolumeKey?: string;
  /** Chapter number of the lowest draft the judge flagged as contradicting the bible. */
  contradictedChapter?: number;
  /** Queued drafts, plus pending continuity and refinement proposals — the Review Queue's own count. */
  reviewQueueCount: number;
  /** Drafted-but-not-final chapters, formatted as e.g. "1–3, 5" — the chapters finalizing would lock in. */
  notFinalChapterRange?: string;
}

interface NextStepRule {
  id: NextStepId;
  /** Replaces the roadmap padding for a rule whose own path is not the Workspace roadmap. */
  comingUp?: (input: NextStepInput) => readonly ComingUpItem[];
  /** Position in the bible → plan → draft → arc → finalize roadmap; interrupts (repair/review) have none. */
  roadmapIndex?: number;
  test(input: NextStepInput): boolean;
  build(input: NextStepInput): NextStepAction;
  comingUpLabel: string;
}

const OPEN_WORKSPACE: ComingUpItem = { id: 'open-workspace', label: 'Open the Workspace' };
const FIRST_CHAPTER: ComingUpItem = { id: 'generate-chapter', label: 'Generate chapter 1' };

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
    // The Blueprint answers "what do I do next" on its own, and it settles the plan the Workspace roadmap
    // would otherwise tell the author to build by hand — so it replaces the roadmap rather than joining it.
    id: 'continue-blueprint',
    // At the gate the next step already IS opening the Workspace, so listing it again would be the same click twice.
    comingUp: input => (input.blueprintComplete === true ? [FIRST_CHAPTER] : [OPEN_WORKSPACE, FIRST_CHAPTER]),
    test: input => input.blueprintStage === 'blueprint',
    build: input =>
      input.blueprintComplete === true
        ? {
            id: 'continue-blueprint',
            label: 'Open the gate',
            reason: 'Every phase of the Blueprint is settled — read the design once more and open the Workspace.',
            target: { screen: 'blueprint' },
          }
        : {
            id: 'continue-blueprint',
            label: 'Continue the Blueprint',
            reason: input.blueprintPhaseLabel
              ? `${input.blueprintPhaseLabel} is the phase you’re on. Nothing is written until the Blueprint is done.`
              : 'The novel is still being designed. Nothing is written until the Blueprint is done.',
            target: { screen: 'blueprint' },
          },
    comingUpLabel: 'Finish the Blueprint',
  },
  {
    id: 'build-plan',
    roadmapIndex: 0,
    test: input => input.volumesTotal === 0,
    build: () => ({
      id: 'build-plan',
      label: 'Build your plan',
      reason: 'Nothing is outlined yet — start with the story bible.',
      target: { screen: 'story-bible' },
    }),
    comingUpLabel: 'Build your plan',
  },
  {
    id: 'approve-plan',
    roadmapIndex: 1,
    test: input => input.volumesTotal > 0 && !input.planApproved,
    build: () => ({
      id: 'approve-plan',
      label: 'Approve the volume plan',
      reason: 'The volume plan is drafted and waiting on your approval.',
      target: { screen: 'volumes' },
    }),
    comingUpLabel: 'Approve the volume plan',
  },
  {
    id: 'generate-chapter',
    roadmapIndex: 2,
    test: input => input.planApproved && input.briefsRemaining > 0,
    build: input => ({
      id: 'generate-chapter',
      label: input.nextBriefChapter != null ? `Generate chapter ${input.nextBriefChapter}` : 'Generate the next chapter',
      reason: `${input.briefsRemaining} outlined chapter${input.briefsRemaining === 1 ? ' is' : 's are'} waiting to be drafted.`,
      target: { screen: 'chapters', chapter: input.nextBriefChapter },
    }),
    comingUpLabel: 'Generate the next chapter',
  },
  {
    id: 'plan-next-arc',
    roadmapIndex: 3,
    test: input => input.planApproved && input.arcsLeft && input.briefsRemaining <= 2,
    build: input => ({
      id: 'plan-next-arc',
      label: 'Plan the next arc',
      reason: 'The outline is running low on drafted chapters.',
      target: { screen: 'volumes', volumeKey: input.nextArcVolumeKey },
    }),
    comingUpLabel: 'Plan the next arc',
  },
  {
    id: 'finalize-chapters',
    roadmapIndex: 4,
    test: input => input.planApproved && input.draftsTotal > 0 && input.draftsFinal < input.draftsTotal && input.reviewQueueCount === 0 && input.briefsRemaining <= 0,
    build: input => ({
      id: 'finalize-chapters',
      label: 'Finalize chapters',
      // Finalize has no plain button — it's a hub action the author asks the chat assistant to run.
      reason: input.notFinalChapterRange
        ? `Every drafted chapter is approved — ask the assistant to finalize chapter${/[,–]/.test(input.notFinalChapterRange) ? 's' : ''} ${input.notFinalChapterRange}.`
        : 'Every drafted chapter is approved — ask the assistant to finalize them.',
      target: { screen: 'chat' },
    }),
    comingUpLabel: 'Finalize chapters',
  },
];

function hasRoadmapIndex(rule: NextStepRule): rule is NextStepRule & { roadmapIndex: number } {
  return rule.roadmapIndex !== undefined;
}

const ROADMAP = [...RULES].filter(hasRoadmapIndex).sort((a, b) => a.roadmapIndex - b.roadmapIndex);

function roadmapAnchorIndex(input: NextStepInput): number {
  if (input.volumesTotal === 0) return 0;
  if (!input.planApproved) return 1;
  return 2;
}

/**
 * The Overview "Next step" rule engine: evaluates the fixed priority order below against the project's
 * current state and returns the one action the author should take next, plus a short preview of what
 * follows. Priority (highest first): a contradicted draft, a non-empty review queue, an empty plan, an
 * unapproved plan, un-drafted briefs, a low-brief warning while more arcs remain, then chapters awaiting
 * finalize. `comingUp` prefers other rules that are independently true right now (in priority order) and
 * pads the rest from the roadmap stages ahead of wherever the author actually is.
 */
export function computeNextStep(input: NextStepInput): NextStepResult {
  const evaluated = RULES.map(rule => ({ rule, isTrue: rule.test(input) }));
  const nextEntry = evaluated.find(entry => entry.isTrue);
  if (!nextEntry) return { comingUp: [] };

  if (nextEntry.rule.comingUp) return { next: nextEntry.rule.build(input), comingUp: [...nextEntry.rule.comingUp(input)] };

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
  volumeKey?: string | null;
}

interface VolumeLike {
  volumeKey: string;
  ordinal: number;
  startChapter?: number | null;
  endChapter?: number | null;
  targetChapterCount?: number | null;
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
  blueprintStage?: BlueprintStage | null;
  blueprintPhaseLabel?: string;
  blueprintComplete?: boolean;
  volumesTotal: number;
  planApproved: boolean;
  draftsTotal: number;
  draftsFinal: number;
  briefs: readonly BriefLike[];
  volumes: readonly VolumeLike[];
  /** Every project draft's chapter + status — the actual drafted set, not just a count. */
  draftedChapters: readonly DraftedChapterLike[];
  reviewDrafts: readonly ReviewDraftLike[];
  pendingContinuityCount: number;
  pendingRefinementCount: number;
}

function volumeChapterEnd(volume: VolumeLike): number | undefined {
  if (volume.endChapter != null) return volume.endChapter;
  if (volume.startChapter != null && volume.targetChapterCount != null) return volume.startChapter + volume.targetChapterCount - 1;
  return undefined;
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
 * Shapes the raw project/brief/volume/draft/review-queue data the Overview screen already has into the
 * rule engine's input. Kept separate from `computeNextStep` so both halves stay independently testable.
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

  const plannedChaptersTotal = state.volumes.reduce((sum, volume) => {
    const end = volumeChapterEnd(volume);
    if (end == null || volume.startChapter == null) return sum + (volume.targetChapterCount ?? 0);
    return sum + (end - volume.startChapter + 1);
  }, 0);
  const arcsLeft = plannedChaptersTotal > 0 && state.briefs.length < plannedChaptersTotal;

  let nextArcVolumeKey: string | undefined;
  for (const volume of [...state.volumes].sort((a, b) => a.ordinal - b.ordinal)) {
    const end = volumeChapterEnd(volume);
    if (end == null) continue;
    const maxBriefInVolume = Math.max(0, ...state.briefs.filter(brief => brief.volumeKey === volume.volumeKey).map(brief => brief.chapter));
    if (maxBriefInVolume < end) {
      nextArcVolumeKey = volume.volumeKey;
      break;
    }
  }

  const contradictedChapter = state.reviewDrafts
    .filter(draft => draft.reviewStatus === 'contradiction')
    .map(draft => draft.chapter)
    .sort((a, b) => a - b)[0];

  return {
    blueprintStage: state.blueprintStage,
    blueprintPhaseLabel: state.blueprintPhaseLabel,
    blueprintComplete: state.blueprintComplete,
    volumesTotal: state.volumesTotal,
    planApproved: state.planApproved,
    draftsTotal: state.draftsTotal,
    draftsFinal: state.draftsFinal,
    briefsRemaining,
    nextBriefChapter,
    arcsLeft,
    nextArcVolumeKey,
    contradictedChapter,
    reviewQueueCount: state.reviewDrafts.length + state.pendingContinuityCount + state.pendingRefinementCount,
    notFinalChapterRange,
  };
}
