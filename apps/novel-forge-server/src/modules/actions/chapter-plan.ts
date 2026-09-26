import {
  composePlanBody,
  evaluateUnlock,
  findPlanClaimProblems,
  normalizeBriefScenes,
  type PlanClaims,
  planUnlockContext,
  type PlanWorld,
  renderBriefBody,
  type RevealFact,
  revealRequirements,
} from '@server/common';
import { type Knowledge, type Plan, type Story } from '@server/database';

import { computeDormantThreads } from '../ai/context/dormant-threads';
import { findBriefRevealViolations, isRevealLocked, renderRevealViolation, type RevealViolation, sanitiseBriefReveals, scheduledReveals } from '../ai/context/canon-guard';
import { type ChapterPlanOutput } from '../ai/schemas/chapter-plan.schema';
import { type BriefUpdateOp } from '../refinement/change-set';

export type ObligationKind = 'hook' | 'promise' | 'volume_goal';

export interface PlanObligation {
  kind: ObligationKind;
  ref: string | null;
  text: string;
}

type ThreadRow = Pick<
  Story.PlotThread,
  'threadKey' | 'summary' | 'status' | 'intentionallyOpen' | 'openedChapter' | 'lastAdvancedChapter' | 'payoffWindow' | 'payoffMilestoneKey' | 'payoffVolumeKey'
>;
type MysteryRow = Pick<
  Story.Mystery,
  'mysteryKey' | 'question' | 'status' | 'intentionallyOpen' | 'openedChapter' | 'lastAdvancedChapter' | 'payoffWindow' | 'payoffMilestoneKey' | 'payoffVolumeKey'
>;

export interface ObligationSources {
  chapter: number;
  previousEnding: unknown;
  threads: readonly ThreadRow[];
  mysteries: readonly MysteryRow[];
  volume: Pick<Plan.Volume, 'volumeKey' | 'title' | 'objective'> | null;
  /** Every milestone's state, keyed by milestoneKey — a promise due by milestone becomes the pressing one once its target is reached. */
  milestoneStates?: ReadonlyMap<string, Knowledge.MilestoneState>;
  /** Every volume's state, keyed by volumeKey — a promise due by volume becomes the pressing one once its target's goal is met. */
  volumeStates?: ReadonlyMap<string, Plan.VolumeState>;
}

export type PlanFact = RevealFact & Pick<Knowledge.CanonFact, 'terms' | 'writerNote'>;

export type PlanMilestone = Pick<Knowledge.Milestone, 'milestoneKey' | 'label' | 'subjectEntityKey' | 'state'>;

export type PlanCardOp = BriefUpdateOp & { rationale?: string; startedEmpty?: boolean };

export interface VettedPlan {
  plan: ChapterPlanOutput & { chapter: number };
  /** The planner's own account of what the plan moves, cut like the plan of anything it may not reveal yet. */
  moves?: string;
  claimedMilestones: string[];
  droppedClaims: string[];
  sanitised: RevealViolation[];
}

type PromiseDueBy = 'chapter' | 'milestone' | 'volume' | null;

interface PromiseCandidate {
  ref: string;
  label: string;
  quietSince: number;
  payoffWindow: number | null;
  due: boolean;
  dueBy: PromiseDueBy;
  /** P4-41b: a payoff volume's goal being met is past due, not merely due — ranked with an authored chapter window rather than below it. */
  overdue: boolean;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function hookObligation(chapter: number, ending: unknown): PlanObligation | null {
  if (chapter <= 1 || !ending || typeof ending !== 'object') return null;
  const contract = ending as Record<string, unknown>;
  const question = text(contract['openQuestion']);
  const handoff = text(contract['handoffState']);
  if (!question && !handoff) return null;
  const opens = handoff ? `; this chapter opens from: ${handoff}` : '';
  return { kind: 'hook', ref: `chapter:${chapter - 1}`, text: `Chapter ${chapter - 1} ends on ${question ? `"${question}"` : 'its handoff'}${opens}` };
}

/**
 * Overdue (an authored chapter window passed, or a payoff volume's goal was already met) outranks merely due (a payoff milestone reached,
 * or a payoff volume now active — P4-41b), which outranks not due; ties break by longest-quiet, then by ref.
 */
function byUrgency(left: PromiseCandidate, right: PromiseCandidate): number {
  const rank = (candidate: PromiseCandidate): number => (candidate.overdue ? 0 : candidate.due ? 1 : 2);
  const byRank = rank(left) - rank(right);
  if (byRank !== 0) return byRank;
  if (rank(left) === 0 && left.dueBy === 'chapter' && right.dueBy === 'chapter' && left.payoffWindow !== right.payoffWindow)
    return (left.payoffWindow as number) - (right.payoffWindow as number);
  if (left.quietSince !== right.quietSince) return left.quietSince - right.quietSince;
  return left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0;
}

type PromiseTiming = Pick<ThreadRow, 'lastAdvancedChapter' | 'openedChapter' | 'payoffWindow' | 'payoffMilestoneKey' | 'payoffVolumeKey'>;

function candidate(
  kind: 'thread' | 'mystery',
  key: string,
  label: string,
  row: PromiseTiming,
  chapter: number,
  milestoneStates: ReadonlyMap<string, Knowledge.MilestoneState> | undefined,
  volumeStates: ReadonlyMap<string, Plan.VolumeState> | undefined,
): PromiseCandidate {
  const dueByChapter = row.payoffWindow !== null && row.payoffWindow <= chapter;
  const dueByMilestone = row.payoffMilestoneKey !== null && milestoneStates?.get(row.payoffMilestoneKey) === 'reached';
  // P4-41b: the payoff volume being the one now underway is the reminder to close the promise before it wraps; the volume already having
  // met its goal is the promise having missed that window — overdue, not merely due.
  const volumeState = row.payoffVolumeKey !== null ? volumeStates?.get(row.payoffVolumeKey) : undefined;
  const dueByVolume = volumeState === 'active';
  const overdueByVolume = volumeState === 'goal_met';
  const dueBy: PromiseDueBy = dueByChapter ? 'chapter' : dueByMilestone ? 'milestone' : dueByVolume || overdueByVolume ? 'volume' : null;
  return {
    ref: `${kind}:${key}`,
    label,
    quietSince: row.lastAdvancedChapter ?? row.openedChapter ?? 0,
    payoffWindow: row.payoffWindow,
    due: dueBy !== null,
    dueBy,
    overdue: dueByChapter || overdueByVolume,
  };
}

/**
 * A promise overdue — an authored chapter window passed, or its payoff volume already met its goal — comes first; then one merely due (its
 * payoff milestone reached, or its payoff volume now active); otherwise the one quiet the longest. A promise dormant on purpose is never an
 * obligation.
 */
function promiseObligation(sources: ObligationSources): PlanObligation | null {
  const { chapter, milestoneStates, volumeStates } = sources;
  const flagged = new Map(computeDormantThreads(sources.threads, sources.mysteries, chapter - 1).map(entry => [`${entry.kind}:${entry.key}`, entry.reason]));
  const open = <T extends { status: string; intentionallyOpen: boolean }>(row: T): boolean => row.status === 'open' && !row.intentionallyOpen;
  const candidates: PromiseCandidate[] = [
    ...sources.threads.filter(open).map(row => candidate('thread', row.threadKey, row.summary?.trim() || row.threadKey, row, chapter, milestoneStates, volumeStates)),
    ...sources.mysteries.filter(open).map(row => candidate('mystery', row.mysteryKey, row.question, row, chapter, milestoneStates, volumeStates)),
  ];
  const [top] = candidates.sort(byUrgency);
  if (!top) return null;
  const reason = flagged.get(top.ref);
  if (top.dueBy === 'chapter') {
    const when = reason === 'overdue' ? `was due by chapter ${top.payoffWindow}` : `is due by chapter ${top.payoffWindow}`;
    return { kind: 'promise', ref: top.ref, text: `A promise that ${when}: ${top.label}` };
  }
  if (top.dueBy === 'milestone') return { kind: 'promise', ref: top.ref, text: `A promise due now that its payoff milestone is reached: ${top.label}` };
  if (top.dueBy === 'volume') {
    const line = top.overdue ? `A promise overdue — its payoff volume already met its goal: ${top.label}` : `A promise due while its payoff volume is active: ${top.label}`;
    return { kind: 'promise', ref: top.ref, text: line };
  }
  const quiet = top.quietSince > 0 ? `quiet since chapter ${top.quietSince}` : 'not moved since it opened';
  const dormant = reason === 'dormant' ? ', dormant' : '';
  return { kind: 'promise', ref: top.ref, text: `The longest-quiet promise (${quiet}${dormant}): ${top.label}` };
}

function volumeObligation(volume: ObligationSources['volume']): PlanObligation | null {
  const objective = text(volume?.objective);
  if (!volume || !objective) return null;
  return { kind: 'volume_goal', ref: `volume:${volume.volumeKey}`, text: `The goal of ${volume.title?.trim() || volume.volumeKey}: ${objective}` };
}

/** The two or three obligations that matter for the next chapter: the previous chapter's hook, the most pressing promise, the volume goal. */
export function selectObligations(sources: ObligationSources): PlanObligation[] {
  return [hookObligation(sources.chapter, sources.previousEnding), promiseObligation(sources), volumeObligation(sources.volume)].filter(
    (obligation): obligation is PlanObligation => obligation !== null,
  );
}

export function renderObligations(obligations: readonly PlanObligation[]): string {
  if (obligations.length === 0) return '(none recorded — choose from the catalog)';
  return obligations.map(obligation => `- ${obligation.text}${obligation.ref ? ` [${obligation.ref}]` : ''}`).join('\n');
}

export function planRationale(obligations: readonly PlanObligation[], moves?: string): string | undefined {
  const lines = obligations.map(obligation => `- ${obligation.text}`);
  if (moves?.trim()) lines.push(`This plan moves: ${moves.trim()}`);
  return lines.length > 0 ? `What the story owes now:\n${lines.join('\n')}` : undefined;
}

function claimable(key: string, plan: PlanClaims, world: PlanWorld): boolean {
  return findPlanClaimProblems({ ...plan, claimedMilestones: [key] }, world).length === 0;
}

function holdsAt(fact: PlanFact, plan: PlanClaims, world: PlanWorld): boolean {
  return revealRequirements(fact, planUnlockContext(plan, world)).length === 0;
}

/** Each milestone this plan may still claim, with the locked facts claiming it would let the plan reveal. */
export function renderPlanMilestones(milestones: readonly PlanMilestone[], facts: readonly PlanFact[], plan: PlanClaims, world: PlanWorld): string {
  const lines = milestones
    .filter(milestone => milestone.state !== 'reached' && claimable(milestone.milestoneKey, plan, world))
    .map(milestone => {
      const claimed = { ...plan, claimedMilestones: [...(plan.claimedMilestones ?? []), milestone.milestoneKey] };
      const unlocks = facts.filter(fact => fact.unlock && !holdsAt(fact, plan, world) && holdsAt(fact, claimed, world)).map(fact => fact.factKey);
      const subject = milestone.subjectEntityKey ? ` (${milestone.subjectEntityKey})` : '';
      const opens = unlocks.length > 0 ? ` — claiming it unlocks: ${unlocks.join(', ')}` : '';
      return `- ${milestone.milestoneKey}: ${milestone.label}${subject}${opens}`;
    });
  return lines.length > 0 ? lines.join('\n') : '(none open)';
}

function lockedReveals(facts: readonly PlanFact[], plan: PlanClaims, world: PlanWorld) {
  const ctx = planUnlockContext(plan, world);
  return scheduledReveals(facts, unlock => evaluateUnlock(unlock, ctx).holds).filter(reveal => isRevealLocked(reveal, plan.chapter));
}

function keptClaims(output: ChapterPlanOutput, plan: PlanClaims, world: PlanWorld): { kept: string[]; dropped: string[] } {
  const proposed = [...new Set((output.claimedMilestones ?? []).map(key => key.trim()).filter(Boolean))];
  const kept = proposed.filter(key => claimable(key, plan, world));
  return { kept, dropped: proposed.filter(key => !kept.includes(key)) };
}

/** The repair request for a plan that claims what it cannot or reveals what its unlocks do not yet allow; worth one repair, never a failure. */
export function planAdvice(output: ChapterPlanOutput, plan: PlanClaims, facts: readonly PlanFact[], world: PlanWorld): string[] {
  const { kept, dropped } = keptClaims(output, plan, world);
  const claims = dropped.map(key => `claimedMilestones names ${key}, which this chapter cannot claim — claim only a milestone from the MILESTONES list`);
  const reveals = lockedReveals(facts, { ...plan, claimedMilestones: kept }, world);
  return [...claims, ...findBriefRevealViolations([{ ...output, chapter: plan.chapter }], reveals).map(renderRevealViolation)];
}

/**
 * The reveal rule applied to what the planner returned: only claims the plan may make survive, and with them decided, every reveal whose
 * unlock does not hold is cut from the contract and every text field, so the card never proposes what the author could not apply.
 */
export function vetPlan(output: ChapterPlanOutput, plan: PlanClaims, facts: readonly PlanFact[], world: PlanWorld): VettedPlan {
  const { kept, dropped } = keptClaims(output, plan, world);
  const claims = { ...plan, claimedMilestones: kept };
  const factByKey = new Map(facts.map(fact => [fact.factKey, fact]));
  const learns = (output.knowledgeContract?.learns ?? []).filter(learn => {
    const fact = factByKey.get(learn.factKey);
    return fact !== undefined && holdsAt(fact, claims, world);
  });
  const withLearns = output.knowledgeContract ? { ...output, knowledgeContract: { ...output.knowledgeContract, learns } } : output;
  const reveals = lockedReveals(facts, claims, world);
  const { briefs, sanitised } = sanitiseBriefReveals([{ ...withLearns, chapter: plan.chapter }], reveals);
  const moves = output.moves && sanitiseBriefReveals([{ chapter: plan.chapter, objective: output.moves }], reveals).briefs[0]?.objective;
  return { plan: briefs[0] as VettedPlan['plan'], moves, claimedMilestones: kept, droppedClaims: dropped, sanitised };
}

/** A scene's point of view must be a character of the novel; any other key is cleared, and so is a contract member who is not one. */
export function resolveScenePovs<T extends ChapterPlanOutput>(plan: T, characterKeys: ReadonlySet<string>): T {
  const scenes = plan.scenes.map(scene => {
    const pov = scene.pov?.trim();
    return { ...scene, pov: pov && characterKeys.has(pov) ? pov : undefined };
  });
  const contract = plan.knowledgeContract;
  const knowledgeContract = contract && {
    pov: contract.pov.filter(key => characterKeys.has(key)),
    learns: contract.learns?.filter(learn => characterKeys.has(learn.entityKey)),
  };
  return { ...plan, scenes, ...(knowledgeContract ? { knowledgeContract } : {}) };
}

interface PlanOpInput {
  chapter: number;
  steer: string | null;
  rationale?: string;
}

export interface ExistingPlan {
  knowledgeContract: unknown;
  direction: string | null;
}

/** The empty plan the author fills in, only ever for a chapter with no plan; its content mode is left to the project default. */
export function emptyPlanOp(input: PlanOpInput): PlanCardOp {
  const op: PlanCardOp = { op: 'brief.update', chapter: input.chapter, body: '', scenes: [], claimedMilestones: [], startedEmpty: true };
  if (input.steer) op.direction = input.steer;
  if (input.rationale) op.rationale = input.rationale;
  return op;
}

/**
 * The whole plan, every field explicit so a replan leaves nothing of the plan it replaces. The writer's knowledge is pooled over exactly the
 * scenes' points of view (§4.4); only a plan whose scenes name none falls back to the planner's own list. Never carries a content mode: the
 * chapter keeps its own, or starts from the project's, until the author changes it on the card.
 */
export function chapterPlanOp(input: PlanOpInput & { existing: ExistingPlan | null; vetted: VettedPlan; contextRefs: string[] }): PlanCardOp {
  const { plan, claimedMilestones } = input.vetted;
  const scenes = normalizeBriefScenes(
    plan.scenes.map(scene => ({
      summary: scene.summary,
      pov: scene.pov ?? null,
      goal: scene.goal,
      obstacle: scene.obstacle,
      turn: scene.turn,
      beats: scene.beats,
      estimatedWords: scene.estimatedWords,
    })),
  );
  const scenePovs = [...new Set(scenes.flatMap(scene => (scene.pov ? [scene.pov] : [])))];
  const learns = (plan.knowledgeContract?.learns ?? []).map(({ entityKey, factKey }) => ({ entityKey, factKey }));
  const contractPov = scenePovs.length > 0 ? scenePovs : [...new Set(plan.knowledgeContract?.pov ?? [])];
  const frame = renderBriefBody({ ...plan, objective: plan.objective.replace(/\s+/g, ' ').trim(), events: [] });

  const op: PlanCardOp = {
    op: 'brief.update',
    chapter: input.chapter,
    title: plan.title,
    body: composePlanBody(frame, scenes),
    contextRefs: input.contextRefs,
    pov: scenePovs[0] ?? null,
    chapterPurpose: plan.chapterPurpose,
    readerValue: plan.readerValue,
    repetitionRisks: plan.repetitionRisks?.length ? plan.repetitionRisks : null,
    densityRisk: plan.densityRisk?.trim() || null,
    endingContract: plan.endingContract as BriefUpdateOp['endingContract'],
    scenes,
    claimedMilestones,
  };
  if (contractPov.length > 0 && (scenePovs.length > 0 || learns.length > 0)) op.knowledgeContract = { pov: contractPov, learns };
  else if (input.existing?.knowledgeContract) op.knowledgeContract = null;
  if (input.steer) op.direction = input.steer;
  else if (input.existing?.direction) op.direction = null;
  if (input.rationale) op.rationale = input.rationale;
  return op;
}
