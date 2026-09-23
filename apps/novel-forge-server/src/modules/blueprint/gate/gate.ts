import { planStaleLabel } from '@server/common';
import { type Generation, type Ledger, type Plan } from '@server/database';

import { type BlueprintPhaseProgress, isDecided } from '../stage/blueprint-stage';

export const GATE_STATEMENT = 'The Workspace is open: the Blueprint settled everything volume one needs.';

export type GateWarningKind = 'arc_stale' | 'arc_brief_range' | 'brief_stale' | 'check_outdated';

export interface GateStepGap {
  phase: Ledger.Phase;
  phaseLabel: string;
  step: string;
}

/** Something the author should see before the gate, but not something they are held behind: every one of them is fixed by locking a step again. */
export interface GateWarning {
  kind: GateWarningKind;
  title: string;
  detail: string;
  /** The step whose lock settles the warning. */
  step: string;
  /** Other steps the warning is about, as keys — the client owns their wording. */
  steps: string[];
}

export interface BriefedArc {
  arcKey: string;
  chapters: number[];
}

export function unfinishedRequiredSteps(phases: BlueprintPhaseProgress[]): GateStepGap[] {
  return phases.flatMap(phase =>
    phase.steps.filter(step => step.required && step.applies && !step.done).map(step => ({ phase: phase.phase, phaseLabel: phase.label, step: step.key })),
  );
}

function newestDecisionOfStep(ledger: Ledger.Entry[], stepKey: string): Ledger.Entry | null {
  const written = ledger.filter(entry => entry.stepKey === stepKey && isDecided(entry) && entry.supersededAt === null);
  return written.reduce<Ledger.Entry | null>((newest, entry) => (newest === null || entry.createdAt > newest.createdAt ? entry : newest), null);
}

/**
 * The final check reads the whole design at once and nothing re-runs it, so anything a step settled after
 * it ran was never part of what it checked. A revisit that only takes a decision down moves the design as
 * much as one that adds to it, so a retired entry counts by when it was retired — which is why this reads
 * the ledger's whole history, not just its active entries.
 */
export function stepsDecidedAfterCheck(history: Ledger.Entry[], checkStepKey: string): string[] {
  const check = newestDecisionOfStep(history, checkStepKey);
  if (check === null) return [];
  const moved = history
    .filter(entry => isDecided(entry) && (entry.createdAt > check.createdAt || (entry.supersededAt !== null && entry.supersededAt > check.createdAt)))
    .map(entry => entry.stepKey)
    .filter((stepKey): stepKey is string => stepKey !== null && stepKey !== checkStepKey);
  return [...new Set(moved)];
}

function payloadOf(entry: Ledger.Entry | undefined): Record<string, unknown> {
  return typeof entry?.payload === 'object' && entry?.payload !== null ? (entry.payload as Record<string, unknown>) : {};
}

/** The chapters the briefs lock actually wrote, read from the entry rather than the brief rows so a hand-deleted brief still shows as a gap. */
export function briefedArc(ledger: Ledger.Entry[], briefsStepKey: string, briefsTopic: string): BriefedArc | null {
  const decision = [...ledger].reverse().find(entry => entry.topic === briefsTopic && entry.kind === 'decision' && entry.stepKey === briefsStepKey);
  const payload = payloadOf(decision);
  const arcKey = typeof payload['arcKey'] === 'string' ? payload['arcKey'].trim() : '';
  if (!arcKey) return null;
  const briefs = Array.isArray(payload['briefs']) ? payload['briefs'] : [];
  const chapters = briefs
    .map(brief => (typeof brief === 'object' && brief !== null ? (brief as { chapter?: unknown }).chapter : undefined))
    .filter((chapter): chapter is number => typeof chapter === 'number' && Number.isInteger(chapter))
    .sort((a, b) => a - b);
  return { arcKey, chapters };
}

function chapterRange(chapters: number[]): string {
  const first = chapters[0];
  const last = chapters.at(-1);
  if (first === undefined || last === undefined) return 'no chapters';
  return first === last ? `chapter ${first}` : `chapters ${first}–${last}`;
}

function reasons(stale: { staleReason: string | null }[]): string {
  return [...new Set(stale.map(row => planStaleLabel(row.staleReason ?? '')))].join(' and ');
}

export function staleArcWarning(arcs: Pick<Plan.Arc, 'arcKey' | 'title' | 'staleReason'>[], arcsStepKey: string): GateWarning | null {
  const stale = arcs.filter(arc => arc.staleReason !== null);
  if (stale.length === 0) return null;
  const named = stale.map(arc => arc.title ?? arc.arcKey).join(', ');
  return {
    kind: 'arc_stale',
    title: 'Volume one’s arcs no longer match its shape',
    detail: `${named} ${stale.length === 1 ? 'was drawn' : 'were drawn'} before ${reasons(stale)}, and nothing redrew them. Lock volume one’s arcs again, then its briefs.`,
    step: arcsStepKey,
    steps: [],
  };
}

/** A brief flagged stale was written against an arc that has since been rewritten under it; the prose it plans no longer matches the arc. */
export function staleBriefWarning(briefs: Pick<Generation.Brief, 'chapter' | 'staleReason'>[], briefsStepKey: string): GateWarning | null {
  const stale = briefs.filter(brief => brief.staleReason !== null);
  if (stale.length === 0) return null;
  const chapters = stale.map(brief => brief.chapter).sort((a, b) => a - b);
  return {
    kind: 'brief_stale',
    title: 'Arc one’s briefs were written against an older arc',
    detail: `The briefs for ${chapterRange(chapters)} were written before ${reasons(stale)}. Lock arc one’s briefs again so chapter one is planned from the arc as it stands.`,
    step: briefsStepKey,
    steps: [],
  };
}

/**
 * Arc one's chapters and the briefs written for it, compared against each other rather than against the range the arcs lock recorded —
 * approving the volume plan can re-tile an arc, and the briefs keep the range they were written for.
 */
export function arcBriefRangeWarning(
  arc: Pick<Plan.Arc, 'arcKey' | 'chapterStart' | 'chapterEnd'> | undefined,
  briefed: BriefedArc | null,
  briefsStepKey: string,
): GateWarning | null {
  if (!briefed) return null;
  if (!arc || arc.arcKey !== briefed.arcKey)
    return {
      kind: 'arc_brief_range',
      title: 'The locked briefs belong to an arc that is no longer arc one',
      detail: 'The briefs were written for an arc that is not the first arc of volume one any more. Lock arc one’s briefs again.',
      step: briefsStepKey,
      steps: [],
    };

  const { chapterStart: start, chapterEnd: end } = arc;
  if (start === null || end === null) return null;
  const wanted: number[] = [];
  for (let chapter = start; chapter <= end; chapter++) wanted.push(chapter);
  const covered = new Set(briefed.chapters);
  const missing = wanted.filter(chapter => !covered.has(chapter));
  const extra = briefed.chapters.filter(chapter => chapter < start || chapter > end);
  if (missing.length === 0 && extra.length === 0) return null;

  return {
    kind: 'arc_brief_range',
    title: 'Arc one’s chapters and its briefs don’t line up',
    detail: `Arc one runs ${chapterRange(wanted)}, and the locked briefs cover ${chapterRange(briefed.chapters)}. Lock arc one’s briefs again so every chapter it plans has one.`,
    step: briefsStepKey,
    steps: [],
  };
}

export function outdatedCheckWarning(steps: string[], checkStepKey: string): GateWarning | null {
  if (steps.length === 0) return null;
  return {
    kind: 'check_outdated',
    title: 'The final check ran before your last change',
    detail: 'Nothing re-runs the final check on its own, so what moved since it ran has not been checked. Run it again to see what it says now.',
    step: checkStepKey,
    steps,
  };
}
