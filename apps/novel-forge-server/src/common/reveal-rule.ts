import { type Knowledge, type UnlockCondition } from '@server/database';

import { parseKnowledgeContract } from './knowledge-contract';
import { describeUnlockTerm, evaluateUnlock, type UnlockContext } from './unlock-condition';

export interface PlanClaims {
  chapter: number;
  volumeKey: string | null;
  isEnding: boolean;
  claimedMilestones: string[] | null;
}

export interface PlanRow extends PlanClaims {
  knowledgeContract: unknown;
}

export interface MilestoneRow {
  milestoneKey: string;
  state: Knowledge.MilestoneState;
  reachedChapter: number | null;
}

export interface RevealFact {
  factKey: string;
  revealChapter: number | null;
  unlock: UnlockCondition | null;
  source: Knowledge.FactSource;
}

export interface PlanWorld {
  plans: readonly PlanRow[];
  milestones: readonly MilestoneRow[];
  volumeOrdinals: ReadonlyMap<string, number>;
}

export interface RevealRuleViolation {
  factKey: string;
  missing: string[];
}

export interface MilestonePlanState {
  state: 'open' | 'planned';
  plannedChapter: number | null;
}

export const UNDATED_REVEAL_REQUIREMENT = 'a reveal chapter or an unlock condition';

function reachedBy(world: PlanWorld, chapter: number): Set<string> {
  return new Set(
    world.milestones
      .filter(milestone => milestone.state === 'reached' && (milestone.reachedChapter === null || milestone.reachedChapter <= chapter))
      .map(milestone => milestone.milestoneKey),
  );
}

function endingChapterOf(plan: PlanClaims, world: PlanWorld): number | null {
  if (plan.isEnding) return plan.chapter;
  return world.plans.find(other => other.isEnding && other.chapter !== plan.chapter)?.chapter ?? null;
}

function contextFor(plan: PlanClaims, world: PlanWorld, reached: ReadonlySet<string>, endingChapter: number | null): UnlockContext {
  return { chapter: plan.chapter, endingChapter, volumeKey: plan.volumeKey, volumeOrdinals: world.volumeOrdinals, reachedMilestones: new Set(reached) };
}

/** A milestone counts as reached for a plan once a finalized chapter reached it, or this plan or an earlier one claims it. */
export function planUnlockContext(plan: PlanClaims, world: PlanWorld): UnlockContext {
  const reached = reachedBy(world, plan.chapter);
  for (const key of plan.claimedMilestones ?? []) reached.add(key);
  for (const other of world.plans) {
    if (other.chapter < plan.chapter) for (const key of other.claimedMilestones ?? []) reached.add(key);
  }
  return contextFor(plan, world, reached, endingChapterOf(plan, world));
}

/** Every plan's context in one ascending pass, carrying the claims of the plans before it. */
export function planUnlockContexts<T extends PlanClaims>(world: PlanWorld & { plans: readonly T[] }): Map<T, UnlockContext> {
  const contexts = new Map<T, UnlockContext>();
  const endingChapter = world.plans.find(plan => plan.isEnding)?.chapter ?? null;
  const claimedBefore = new Set<string>();
  for (const plan of [...world.plans].sort((left, right) => left.chapter - right.chapter)) {
    const reached = reachedBy(world, plan.chapter);
    for (const key of [...claimedBefore, ...(plan.claimedMilestones ?? [])]) reached.add(key);
    contexts.set(plan, contextFor(plan, world, reached, endingChapter));
    for (const key of plan.claimedMilestones ?? []) claimedBefore.add(key);
  }
  return contexts;
}

/**
 * What still has to hold before a plan at `ctx` may reveal the fact; empty means it may. A seed fact without a condition is a reader
 * promise the book obeys openly, open canon is dated to the first chapter, and an undated fact without a condition has no planned
 * reveal at all, so no plan may reveal it until the author gives it one.
 */
export function revealRequirements(fact: RevealFact, ctx: UnlockContext): string[] {
  if (fact.source === 'seed' && !fact.unlock) return [];
  const missing: string[] = [];
  if (fact.revealChapter !== null && fact.revealChapter > ctx.chapter) missing.push(describeUnlockTerm({ chapter: fact.revealChapter }));
  if (fact.unlock) missing.push(...evaluateUnlock(fact.unlock, ctx).missing.map(describeUnlockTerm));
  else if (fact.revealChapter === null) missing.push(UNDATED_REVEAL_REQUIREMENT);
  return missing;
}

export function learnedFactKeys(knowledgeContract: unknown): string[] {
  return [...new Set(parseKnowledgeContract(knowledgeContract)?.learns.map(reveal => reveal.factKey) ?? [])];
}

/** Unknown fact keys are not the reveal rule's concern: approval skips them when it ledgers. */
export function findPlanRevealViolations(plan: PlanRow, facts: readonly RevealFact[], world: PlanWorld, context?: UnlockContext): RevealRuleViolation[] {
  const learned = learnedFactKeys(plan.knowledgeContract);
  if (learned.length === 0) return [];
  const factByKey = new Map(facts.map(fact => [fact.factKey, fact]));
  const ctx = context ?? planUnlockContext(plan, world);
  return learned.flatMap(factKey => {
    const fact = factByKey.get(factKey);
    const missing = fact ? revealRequirements(fact, ctx) : [];
    return missing.length > 0 ? [{ factKey, missing }] : [];
  });
}

export function renderRevealRuleViolations(violations: readonly RevealRuleViolation[]): string {
  return violations.map(violation => `${violation.factKey} (needs ${violation.missing.join(' and ')})`).join('; ');
}

/** A milestone is reached once, by one chapter, so a plan may claim only a known milestone that no other plan claims and no other chapter reached. */
export function findPlanClaimProblems(plan: PlanClaims, world: PlanWorld): string[] {
  const milestoneByKey = new Map(world.milestones.map(milestone => [milestone.milestoneKey, milestone]));
  return (plan.claimedMilestones ?? []).flatMap(key => {
    const milestone = milestoneByKey.get(key);
    if (!milestone) return [`${key} is not a milestone of this novel`];
    if (milestone.state === 'reached' && milestone.reachedChapter !== plan.chapter) return [`${key} was already reached in chapter ${milestone.reachedChapter}`];
    const rival = world.plans.find(other => other.chapter !== plan.chapter && (other.claimedMilestones ?? []).includes(key));
    return rival ? [`${key} is already claimed by the plan for chapter ${rival.chapter}`] : [];
  });
}

export function findRivalEnding(plan: PlanClaims, world: PlanWorld): number | null {
  if (!plan.isEnding) return null;
  return world.plans.find(other => other.isEnding && other.chapter !== plan.chapter)?.chapter ?? null;
}

/** Only an unreached milestone moves: `planned` at the earliest chapter whose plan claims it, `open` once none does. */
export function milestonePlanStates(world: PlanWorld): Map<string, MilestonePlanState> {
  const earliestClaim = new Map<string, number>();
  for (const plan of world.plans) {
    for (const key of plan.claimedMilestones ?? []) earliestClaim.set(key, Math.min(plan.chapter, earliestClaim.get(key) ?? plan.chapter));
  }
  const states = new Map<string, MilestonePlanState>();
  for (const milestone of world.milestones) {
    if (milestone.state === 'reached') continue;
    const plannedChapter = earliestClaim.get(milestone.milestoneKey);
    states.set(milestone.milestoneKey, plannedChapter === undefined ? { state: 'open', plannedChapter: null } : { state: 'planned', plannedChapter });
  }
  return states;
}

/** The earliest chapter whose plan may reveal each fact and does; null for a fact no plan validly reveals. */
export function factPlannedChapters(facts: readonly RevealFact[], world: PlanWorld, contexts = planUnlockContexts(world)): Map<string, number | null> {
  const planned = new Map<string, number | null>(facts.map(fact => [fact.factKey, null]));
  const factByKey = new Map(facts.map(fact => [fact.factKey, fact]));
  for (const [plan, ctx] of contexts) {
    for (const factKey of learnedFactKeys(plan.knowledgeContract)) {
      const fact = factByKey.get(factKey);
      if (fact && planned.get(factKey) === null && revealRequirements(fact, ctx).length === 0) planned.set(factKey, plan.chapter);
    }
  }
  return planned;
}
