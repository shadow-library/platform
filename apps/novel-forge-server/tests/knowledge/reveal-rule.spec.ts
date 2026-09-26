import { describe, expect, it } from 'bun:test';

import {
  factPlannedChapters,
  findPlanClaimProblems,
  findPlanRevealViolations,
  findRivalEnding,
  milestonePlanStates,
  type PlanRow,
  planUnlockContext,
  planUnlockContexts,
  type PlanWorld,
  type RevealFact,
  revealRequirements,
  UNDATED_REVEAL_REQUIREMENT,
} from '@server/common';

function plan(chapter: number, overrides: Partial<PlanRow> = {}): PlanRow {
  return { chapter, volumeKey: 'the_tower', isEnding: false, claimedMilestones: null, knowledgeContract: null, ...overrides };
}

function learning(...factKeys: string[]): unknown {
  return { pov: ['mira'], learns: factKeys.map(factKey => ({ entityKey: 'mira', factKey })) };
}

function fact(factKey: string, overrides: Partial<RevealFact> = {}): RevealFact {
  return { factKey, revealChapter: null, unlock: null, source: 'manual', ...overrides };
}

function world(plans: PlanRow[], milestones: PlanWorld['milestones'] = []): PlanWorld {
  return { plans, milestones, volumeOrdinals: new Map([['the_tower', 1]]) };
}

const rankFour = fact('lamp_rank_4_rule', { unlock: { all: [{ milestone: 'lamp_rank_4' }] } });
const openRule = fact('lamp_costs_memory', { revealChapter: 1 });
const datedSecret = fact('keeper_is_heir', { revealChapter: 9 });
const undatedSecret = fact('lamp_is_alive');
const OPEN_MILESTONES = [{ milestoneKey: 'lamp_rank_4', state: 'open' as const, reachedChapter: null }];

describe('planUnlockContext', () => {
  it("should count the plan's own claims and every earlier plan's claims as reached, but not a later plan's", () => {
    const state = world([plan(3, { claimedMilestones: ['a'] }), plan(5, { claimedMilestones: ['b'] }), plan(8, { claimedMilestones: ['c'] })]);

    expect([...planUnlockContext(plan(5, { claimedMilestones: ['b'] }), state).reachedMilestones].sort()).toEqual(['a', 'b']);
  });

  it('should count a milestone a finalized chapter reached, but not for a plan before that chapter', () => {
    const state = world([], [{ milestoneKey: 'a', state: 'reached', reachedChapter: 4 }]);

    expect(planUnlockContext(plan(4), state).reachedMilestones.has('a')).toBe(true);
    expect(planUnlockContext(plan(3), state).reachedMilestones.has('a')).toBe(false);
  });
});

describe('planUnlockContexts', () => {
  it('should give every plan the same context the one-plan form gives it, in one ascending pass', () => {
    const plans = [plan(8, { claimedMilestones: ['c'], isEnding: true }), plan(3, { claimedMilestones: ['a'] }), plan(5, { claimedMilestones: ['b'] })];
    const state = world(plans, [{ milestoneKey: 'z', state: 'reached', reachedChapter: 4 }]);

    for (const [each, ctx] of planUnlockContexts(state)) expect(ctx).toEqual(planUnlockContext(each, state));
  });
});

describe('the ending term', () => {
  const endingSecret = fact('who_lit_the_first_lamp', { unlock: { all: [{ ending: true }] } });

  it('should let the ending plan and an epilogue after it reveal an ending secret, but no chapter before the ending', () => {
    const plans = [plan(39), plan(40, { isEnding: true }), plan(41)];
    const state = world(plans);
    const requirements = (chapter: PlanRow) => revealRequirements(endingSecret, planUnlockContext(chapter, state));

    expect(plans.map(requirements)).toEqual([['the planned ending or later'], [], []]);
    expect(revealRequirements(endingSecret, planUnlockContext(plan(41), world([plan(41)])))).toEqual(['the planned ending or later']);
  });
});

describe('revealRequirements', () => {
  const ctx = planUnlockContext(plan(5), world([]));

  it('should let any plan reveal open canon and an unconditioned seed promise', () => {
    expect(revealRequirements(openRule, ctx)).toEqual([]);
    expect(revealRequirements(fact('reader_promise', { source: 'seed' }), ctx)).toEqual([]);
  });

  it('should keep a dated secret for its chapter, and refuse an undated secret without a condition anywhere', () => {
    expect(revealRequirements(datedSecret, ctx)).toEqual(['chapter 9 or later']);
    expect(revealRequirements(datedSecret, { ...ctx, chapter: 9 })).toEqual([]);
    expect(revealRequirements(undatedSecret, { ...ctx, chapter: 900 })).toEqual([UNDATED_REVEAL_REQUIREMENT]);
  });

  it('should require both the date and the condition of a dated, conditioned secret', () => {
    const both = fact('both', { revealChapter: 9, unlock: { all: [{ milestone: 'lamp_rank_4' }] } });

    expect(revealRequirements(both, ctx)).toEqual(['chapter 9 or later', 'milestone lamp_rank_4 reached']);
    expect(revealRequirements(both, { ...ctx, chapter: 9, reachedMilestones: new Set(['lamp_rank_4']) })).toEqual([]);
  });
});

describe('findPlanRevealViolations', () => {
  it('should refuse a learn whose unlock the plan does not meet, naming what is missing', () => {
    const chapter = plan(5, { knowledgeContract: learning('lamp_rank_4_rule', 'lamp_costs_memory', 'unknown_fact') });

    expect(findPlanRevealViolations(chapter, [rankFour, openRule], world([chapter], OPEN_MILESTONES))).toEqual([
      { factKey: 'lamp_rank_4_rule', missing: ['milestone lamp_rank_4 reached'] },
    ]);
  });

  it('should allow the learn when this plan or an earlier plan claims the milestone', () => {
    const claiming = plan(5, { knowledgeContract: learning('lamp_rank_4_rule'), claimedMilestones: ['lamp_rank_4'] });
    const later = plan(7, { knowledgeContract: learning('lamp_rank_4_rule') });

    expect(findPlanRevealViolations(claiming, [rankFour], world([claiming, later], OPEN_MILESTONES))).toEqual([]);
    expect(findPlanRevealViolations(later, [rankFour], world([claiming, later], OPEN_MILESTONES))).toEqual([]);
  });
});

describe('findPlanClaimProblems', () => {
  it('should refuse an unknown milestone, one another plan claims and one an earlier chapter reached', () => {
    const milestones = [
      { milestoneKey: 'lamp_rank_4', state: 'planned' as const, reachedChapter: null },
      { milestoneKey: 'lamp_rank_3', state: 'reached' as const, reachedChapter: 2 },
    ];
    const rival = plan(4, { claimedMilestones: ['lamp_rank_4'] });
    const chapter = plan(6, { claimedMilestones: ['lamp_rank_4', 'lamp_rank_3', 'lamp_rank_9'] });

    expect(findPlanClaimProblems(chapter, world([rival, chapter], milestones))).toEqual([
      'lamp_rank_4 is already claimed by the plan for chapter 4',
      'lamp_rank_3 was already reached in chapter 2',
      'lamp_rank_9 is not a milestone of this novel',
    ]);
  });

  it('should let the chapter that reached a milestone keep claiming it', () => {
    const chapter = plan(2, { claimedMilestones: ['lamp_rank_3'] });

    expect(findPlanClaimProblems(chapter, world([chapter], [{ milestoneKey: 'lamp_rank_3', state: 'reached', reachedChapter: 2 }]))).toEqual([]);
  });
});

describe('findRivalEnding', () => {
  it('should name another plan already marked as the ending', () => {
    const ending = plan(40, { isEnding: true });

    expect(findRivalEnding(plan(41, { isEnding: true }), world([ending]))).toBe(40);
    expect(findRivalEnding(plan(40, { isEnding: true }), world([ending]))).toBeNull();
    expect(findRivalEnding(plan(41), world([ending]))).toBeNull();
  });
});

describe('milestonePlanStates', () => {
  it('should plan a milestone at its claiming chapter, open one nobody claims, and leave a reached one alone', () => {
    const states = milestonePlanStates(
      world(
        [plan(6, { claimedMilestones: ['a'] })],
        [
          { milestoneKey: 'a', state: 'open', reachedChapter: null },
          { milestoneKey: 'b', state: 'planned', reachedChapter: null },
          { milestoneKey: 'c', state: 'reached', reachedChapter: 2 },
        ],
      ),
    );

    expect(Object.fromEntries(states)).toEqual({ a: { state: 'planned', plannedChapter: 6 }, b: { state: 'open', plannedChapter: null } });
  });
});

describe('factPlannedChapters', () => {
  it('should date each fact to the earliest plan that validly reveals it, and leave the rest undated', () => {
    const plans = [
      plan(3, { knowledgeContract: learning('lamp_rank_4_rule', 'keeper_is_heir') }),
      plan(5, { knowledgeContract: learning('lamp_rank_4_rule'), claimedMilestones: ['lamp_rank_4'] }),
      plan(9, { knowledgeContract: learning('keeper_is_heir', 'lamp_rank_4_rule') }),
    ];

    expect(Object.fromEntries(factPlannedChapters([rankFour, datedSecret, undatedSecret], world(plans, OPEN_MILESTONES)))).toEqual({
      lamp_rank_4_rule: 5,
      keeper_is_heir: 9,
      lamp_is_alive: null,
    });
  });
});
