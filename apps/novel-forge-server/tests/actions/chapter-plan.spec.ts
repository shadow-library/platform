import { describe, expect, it } from 'bun:test';

import { type PlanWorld } from '@server/common';

import { chapterPlanOp, emptyPlanOp, planAdvice, type PlanFact, renderPlanMilestones, resolveScenePovs, selectObligations, vetPlan } from '@modules/actions/chapter-plan';
import { ChapterPlanService } from '@modules/actions/chapter-plan.service';
import { chapterPlanPrompt } from '@modules/ai/prompts/chapter-plan.prompt';
import { type ChapterPlanOutput } from '@modules/ai/schemas/chapter-plan.schema';

import { planTables } from '../knowledge/plan-tables';

const LAMP_UNLOCK = { all: [{ milestone: 'lamp_rank_3' }] };

function thread(key: string, overrides: Record<string, unknown> = {}) {
  return {
    threadKey: key,
    summary: `The ${key} thread`,
    status: 'open',
    intentionallyOpen: false,
    openedChapter: 1,
    lastAdvancedChapter: 1,
    payoffWindow: null,
    payoffMilestoneKey: null,
    payoffVolumeKey: null,
    ...overrides,
  } as never;
}

function scene(pov: string | undefined, beats = ['She lifts the lamp.', 'It burns cold.']) {
  return { summary: `A scene for ${pov ?? 'nobody'}`, pov, goal: 'Reach the gate.', obstacle: 'The keeper bars it.', turn: 'The gate opens.', beats, estimatedWords: 900 };
}

function output(overrides: Partial<ChapterPlanOutput> = {}): ChapterPlanOutput {
  return {
    title: 'The Cold Lamp',
    objective: 'Mara tests the lamp at the gate.',
    scenes: [scene('mara'), scene('mara'), scene('ren')],
    requiredContext: ['entity:mara'],
    endingContract: { hookType: 'turn', emotionalBeat: 'Unease', openQuestion: 'Who lit the lamp?', handoffState: 'Mara at the open gate' },
    chapterPurpose: 'Mara learns what the lamp is.',
    readerValue: ['new_information'],
    ...overrides,
  } as ChapterPlanOutput;
}

function world(overrides: Partial<PlanWorld> = {}): PlanWorld {
  return { plans: [], milestones: [{ milestoneKey: 'lamp_rank_3', state: 'open', reachedChapter: null }], volumeOrdinals: new Map(), ...overrides };
}

const FACTS: PlanFact[] = [
  { factKey: 'lamp_origin', revealChapter: null, unlock: LAMP_UNLOCK, source: 'manual', terms: ['drowned king'], writerNote: null },
  { factKey: 'sealed_truth', revealChapter: null, unlock: null, source: 'manual', terms: ['sealed vault'], writerNote: null },
];
const PLAN = { chapter: 4, volumeKey: null, isEnding: false, claimedMilestones: [] };

function opFor(plan: ChapterPlanOutput, existing: { knowledgeContract: unknown; direction: string | null } | null = null) {
  return chapterPlanOp({ chapter: 4, steer: null, existing, vetted: vetPlan(plan, PLAN, FACTS, world()), contextRefs: [] });
}

describe('selectObligations', () => {
  it('should recap the previous hook, the promise that is due and the volume goal, in that order', () => {
    const obligations = selectObligations({
      chapter: 5,
      previousEnding: { openQuestion: 'Who opened the gate?', handoffState: 'Mara in the flooded hall' },
      threads: [thread('debt', { lastAdvancedChapter: 1 }), thread('oath', { lastAdvancedChapter: 4, payoffWindow: 5 })],
      mysteries: [],
      volume: { volumeKey: 'vol_01', title: 'The Mine', objective: 'Mara escapes the mine.' },
    });

    expect(obligations).toEqual([
      { kind: 'hook', ref: 'chapter:4', text: 'Chapter 4 ends on "Who opened the gate?"; this chapter opens from: Mara in the flooded hall' },
      { kind: 'promise', ref: 'thread:oath', text: 'A promise that is due by chapter 5: The oath thread' },
      { kind: 'volume_goal', ref: 'volume:vol_01', text: 'The goal of The Mine: Mara escapes the mine.' },
    ]);
  });

  it('should surface the longest-quiet promise and never one dormant on purpose', () => {
    const [promise] = selectObligations({
      chapter: 12,
      previousEnding: null,
      threads: [thread('ghost', { lastAdvancedChapter: 1, intentionallyOpen: true }), thread('debt', { lastAdvancedChapter: 2 }), thread('oath', { lastAdvancedChapter: 9 })],
      mysteries: [],
      volume: null,
    });

    expect(promise).toEqual({ kind: 'promise', ref: 'thread:debt', text: 'The longest-quiet promise (quiet since chapter 2, dormant): The debt thread' });
  });

  it('should owe nothing the story has not recorded', () => {
    expect(selectObligations({ chapter: 1, previousEnding: { openQuestion: 'x' }, threads: [], mysteries: [], volume: { volumeKey: 'v', title: null, objective: ' ' } })).toEqual(
      [],
    );
  });

  it('should surface a promise due once its payoff milestone is reached, ahead of a merely quiet one', () => {
    const [promise] = selectObligations({
      chapter: 12,
      previousEnding: null,
      threads: [thread('debt', { lastAdvancedChapter: 2 }), thread('oath', { lastAdvancedChapter: 9, payoffMilestoneKey: 'reveal_thief' })],
      mysteries: [],
      volume: null,
      milestoneStates: new Map([['reveal_thief', 'reached']]),
    });

    expect(promise).toEqual({ kind: 'promise', ref: 'thread:oath', text: 'A promise due now that its payoff milestone is reached: The oath thread' });
  });

  it('should surface a promise due (not yet overdue) while its payoff volume is active (P4-41b)', () => {
    const [promise] = selectObligations({
      chapter: 12,
      previousEnding: null,
      threads: [thread('debt', { lastAdvancedChapter: 2 }), thread('oath', { lastAdvancedChapter: 9, payoffVolumeKey: 'vol_01' })],
      mysteries: [],
      volume: null,
      volumeStates: new Map([['vol_01', 'active']]),
    });

    expect(promise).toEqual({ kind: 'promise', ref: 'thread:oath', text: 'A promise due while its payoff volume is active: The oath thread' });
  });

  it('should surface a promise as overdue once its payoff volume already met its goal (P4-41b)', () => {
    const [promise] = selectObligations({
      chapter: 12,
      previousEnding: null,
      threads: [thread('debt', { lastAdvancedChapter: 2 }), thread('oath', { lastAdvancedChapter: 9, payoffVolumeKey: 'vol_01' })],
      mysteries: [],
      volume: null,
      volumeStates: new Map([['vol_01', 'goal_met']]),
    });

    expect(promise).toEqual({ kind: 'promise', ref: 'thread:oath', text: 'A promise overdue — its payoff volume already met its goal: The oath thread' });
  });

  it('should rank a promise overdue by its payoff volume ahead of one merely quiet, by staleness on a tie with an authored chapter', () => {
    const [promise] = selectObligations({
      chapter: 6,
      previousEnding: null,
      threads: [thread('oath', { lastAdvancedChapter: 5, payoffVolumeKey: 'vol_01' }), thread('debt', { lastAdvancedChapter: 1, payoffWindow: 6 })],
      mysteries: [],
      volume: null,
      volumeStates: new Map([['vol_01', 'goal_met']]),
    });

    // Both are top-ranked (an authored deadline passed; a payoff volume already met its goal) — staleness breaks the tie.
    expect(promise?.ref).toBe('thread:debt');
  });

  it('should rank a promise due by an authored chapter ahead of one merely due by an active payoff volume', () => {
    const [promise] = selectObligations({
      chapter: 6,
      previousEnding: null,
      threads: [thread('oath', { lastAdvancedChapter: 5, payoffVolumeKey: 'vol_01' }), thread('debt', { lastAdvancedChapter: 1, payoffWindow: 6 })],
      mysteries: [],
      volume: null,
      volumeStates: new Map([['vol_01', 'active']]),
    });

    expect(promise?.ref).toBe('thread:debt');
  });

  it('should never treat a payoff milestone or volume as due while it has not been reached', () => {
    const [promise] = selectObligations({
      chapter: 12,
      previousEnding: null,
      threads: [thread('debt', { lastAdvancedChapter: 2 }), thread('oath', { lastAdvancedChapter: 9, payoffMilestoneKey: 'reveal_thief' })],
      mysteries: [],
      volume: null,
      milestoneStates: new Map([['reveal_thief', 'planned']]),
    });

    expect(promise).toEqual({ kind: 'promise', ref: 'thread:debt', text: 'The longest-quiet promise (quiet since chapter 2, dormant): The debt thread' });
  });

  it('should exclude a dropped promise from the recap entirely', () => {
    const obligations = selectObligations({
      chapter: 12,
      previousEnding: null,
      threads: [thread('debt', { status: 'dropped', lastAdvancedChapter: 1 })],
      mysteries: [],
      volume: null,
    });

    expect(obligations).toEqual([]);
  });
});

describe('vetPlan', () => {
  it('should keep a reveal whose unlock the plan’s own claim meets', () => {
    const vetted = vetPlan(
      output({ claimedMilestones: ['lamp_rank_3'], knowledgeContract: { pov: ['mara'], learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] } }),
      PLAN,
      FACTS,
      world(),
    );

    expect(vetted.claimedMilestones).toEqual(['lamp_rank_3']);
    expect(vetted.plan.knowledgeContract?.learns).toEqual([{ entityKey: 'mara', factKey: 'lamp_origin' }]);
  });

  it('should drop a reveal whose unlock is unmet and cut its give-away terms from the text and the planner’s own account', () => {
    const vetted = vetPlan(
      output({
        scenes: [scene('mara', ['She finds the sealed vault.', 'It burns cold.']), scene('mara'), scene('mara')],
        knowledgeContract: {
          pov: ['mara'],
          learns: [
            { entityKey: 'mara', factKey: 'lamp_origin' },
            { entityKey: 'mara', factKey: 'sealed_truth' },
          ],
        },
        moves: 'Opens the sealed vault.',
      }),
      PLAN,
      FACTS,
      world(),
    );

    expect(vetted.plan.knowledgeContract?.learns).toEqual([]);
    expect(vetted.plan.scenes[0]?.beats).toEqual(['It burns cold.']);
    expect(vetted.moves).not.toContain('sealed vault');
  });

  it('should drop claims on unknown milestones and on one another plan already claims', () => {
    const claimed = world({ plans: [{ chapter: 6, volumeKey: null, isEnding: false, claimedMilestones: ['lamp_rank_3'], knowledgeContract: null }] });

    const vetted = vetPlan(output({ claimedMilestones: ['lamp_rank_3', 'ghost'] }), PLAN, FACTS, claimed);

    expect(vetted).toMatchObject({ claimedMilestones: [], droppedClaims: ['lamp_rank_3', 'ghost'] });
  });

  it('should ask for one repair when the plan reveals what its claims do not unlock', () => {
    const advice = planAdvice(
      output({ claimedMilestones: ['ghost'], knowledgeContract: { pov: ['mara'], learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] } }),
      PLAN,
      FACTS,
      world(),
    );

    expect(advice).toEqual([
      'claimedMilestones names ghost, which this chapter cannot claim — claim only a milestone from the MILESTONES list',
      'chapter 4 knowledgeContract.learns names lamp_origin, which stays locked for this whole span — leave the discovery out',
    ]);
  });
});

describe('renderPlanMilestones', () => {
  it('should list the milestones the plan may claim with the secrets each would unlock', () => {
    const milestones = [
      { milestoneKey: 'lamp_rank_3', label: 'Mara reaches Lamp rank 3', subjectEntityKey: 'mara', state: 'open' as const },
      { milestoneKey: 'old_rank', label: 'Reached long ago', subjectEntityKey: null, state: 'reached' as const },
    ];

    expect(renderPlanMilestones(milestones, FACTS, PLAN, world())).toBe('- lamp_rank_3: Mara reaches Lamp rank 3 (mara) — claiming it unlocks: lamp_origin');
    expect(renderPlanMilestones([], FACTS, PLAN, world())).toBe('(none open)');
  });
});

describe('resolveScenePovs', () => {
  it('should clear a point of view that is not a character', () => {
    const plan = resolveScenePovs(output({ scenes: [scene('mara'), scene('the_lamp')] }), new Set(['mara']));

    expect(plan.scenes.map(entry => entry.pov)).toEqual(['mara', undefined]);
  });

  it('should keep only characters in the knowledge contract', () => {
    const contract = {
      pov: ['mara', 'the_lamp'],
      learns: [
        { entityKey: 'the_lamp', factKey: 'lamp_origin' },
        { entityKey: 'mara', factKey: 'lamp_origin' },
      ],
    };

    const plan = resolveScenePovs(output({ knowledgeContract: contract }), new Set(['mara']));

    expect(plan.knowledgeContract).toEqual({ pov: ['mara'], learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] });
  });
});

describe('chapterPlanOp', () => {
  it('should pool the contract over exactly the scene points of view, and never a content mode', () => {
    const plan = output({ claimedMilestones: ['lamp_rank_3'], knowledgeContract: { pov: ['kel'], learns: [{ entityKey: 'ren', factKey: 'lamp_origin' }] } });
    const op = chapterPlanOp({
      chapter: 4,
      steer: 'The lamp burns cold',
      existing: null,
      rationale: 'What the story owes now:\n- x',
      vetted: vetPlan(plan, PLAN, FACTS, world()),
      contextRefs: ['entity:mara'],
    });

    expect(op).toMatchObject({
      op: 'brief.update',
      chapter: 4,
      title: 'The Cold Lamp',
      pov: 'mara',
      direction: 'The lamp burns cold',
      claimedMilestones: ['lamp_rank_3'],
      contextRefs: ['entity:mara'],
      knowledgeContract: { pov: ['mara', 'ren'], learns: [{ entityKey: 'ren', factKey: 'lamp_origin' }] },
      rationale: 'What the story owes now:\n- x',
    });
    expect(op.scenes?.[2]).toEqual({
      summary: 'A scene for ren',
      pov: 'ren',
      goal: 'Reach the gate.',
      obstacle: 'The keeper bars it.',
      turn: 'The gate opens.',
      beats: ['She lifts the lamp.', 'It burns cold.'],
      estimatedWords: 900,
    });
    expect(op.body).toContain('Scene 3 (~900 words). A scene for ren. Goal: Reach the gate.');
    expect(op.body).toContain('POV: ren.');
    expect(op).not.toHaveProperty('contentMode');
  });

  it('should never add a learner who is not a scene point of view to the pooled cast', () => {
    const plan = output({
      scenes: [scene('mara')],
      claimedMilestones: ['lamp_rank_3'],
      knowledgeContract: { pov: ['mara'], learns: [{ entityKey: 'kel', factKey: 'lamp_origin' }] },
    });

    expect(opFor(plan).knowledgeContract).toEqual({ pov: ['mara'], learns: [{ entityKey: 'kel', factKey: 'lamp_origin' }] });
  });

  it('should bound a multi-POV plan with no reveal to its scene points of view, replacing the contract it replans', () => {
    const op = opFor(output(), { knowledgeContract: { pov: ['kel'], learns: [{ entityKey: 'kel', factKey: 'lamp_origin' }] }, direction: null });

    expect(op.knowledgeContract).toEqual({ pov: ['mara', 'ren'], learns: [] });
  });

  it('should fall back to the planner’s cast only when no scene names a point of view', () => {
    const plan = output({
      scenes: [scene(undefined)],
      claimedMilestones: ['lamp_rank_3'],
      knowledgeContract: { pov: ['mara'], learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] },
    });

    expect(opFor(plan).knowledgeContract).toEqual({ pov: ['mara'], learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] });
  });

  it('should clear what the replaced plan held that the new one does not', () => {
    const op = opFor(output({ scenes: [scene(undefined)] }), { knowledgeContract: { pov: ['mara'], learns: [] }, direction: 'Old' });

    expect(op).toMatchObject({ pov: null, knowledgeContract: null, direction: null, claimedMilestones: [], repetitionRisks: null, densityRisk: null });
  });

  it('should carry the planner’s repetition and density risks', () => {
    const op = opFor(output({ repetitionRisks: ['another gate scene'], densityRisk: ' Thin material ' }));

    expect(op).toMatchObject({ repetitionRisks: ['another gate scene'], densityRisk: 'Thin material' });
  });
});

describe('emptyPlanOp', () => {
  it('should open an empty plan the author fills in, marked as started empty', () => {
    expect(emptyPlanOp({ chapter: 4, steer: null })).toEqual({ op: 'brief.update', chapter: 4, body: '', scenes: [], claimedMilestones: [], startedEmpty: true });
  });
});

describe('chapterPlanPrompt', () => {
  it('should be a new versioned planner that plans one chapter with a point of view per scene, intent first', () => {
    const human = JSON.stringify(chapterPlanPrompt.template);

    expect([chapterPlanPrompt.key, chapterPlanPrompt.version, chapterPlanPrompt.role]).toEqual(['chapter-plan', '1.0.0', 'outline']);
    expect(chapterPlanPrompt.system).toContain('You plan ONE chapter');
    expect(chapterPlanPrompt.system).toContain('Each scene names its point of view');
    expect(human.indexOf('{authorIntent}')).toBeLessThan(human.indexOf('{chosenDirection}'));
  });

  it('should require a handoff beat only when the chapter continues', () => {
    expect(chapterPlanPrompt.postValidate?.(output({ continuesIntoNextChapter: true }))).toEqual([
      'handoffBeat is required when the chapter continues into the next one or starts from the previous one',
    ]);
    expect(chapterPlanPrompt.postValidate?.(output())).toEqual([]);
  });
});

describe('ChapterPlanService', () => {
  function service(result: ChapterPlanOutput = output(), briefs: Record<string, unknown>[] = []) {
    const tables = planTables({
      drafts: [{ chapter: 1 }, { chapter: 2 }, { chapter: 3 }],
      briefs: [{ chapter: 3, title: 'The Gate', body: 'Mara reaches the gate.', endingContract: { openQuestion: 'Who waits inside?' } }, ...briefs],
      milestones: [{ milestoneKey: 'lamp_rank_3', label: 'Mara reaches Lamp rank 3' }],
      facts: [
        { id: 201n, factKey: 'lamp_origin', text: 'The lamp holds a drowned king.', unlock: LAMP_UNLOCK, terms: ['drowned king'] },
        { id: 202n, factKey: 'sealed_truth', text: 'The vault is empty.', terms: ['sealed vault'] },
      ],
      entities: [
        { id: 101n, entityKey: 'mara', name: 'Mara', type: 'character' },
        { id: 102n, entityKey: 'ren', name: 'Ren', type: 'character' },
      ],
    });
    const db = { ...tables.db, query: { ...tables.db.query, plotThreads: { findMany: async () => [thread('debt')] }, mysteries: { findMany: async () => [] } } };
    const calls: { vars: Record<string, unknown>; ctx: Record<string, unknown>; advice: string[] }[] = [];
    const modelRouter = {
      structured: async (prompt: { advise: (plan: ChapterPlanOutput) => string[] }, vars: Record<string, unknown>, ctx: Record<string, unknown>) => {
        calls.push({ vars, ctx, advice: prompt.advise(result) });
        return result;
      },
    };
    const contextAssembler = {
      forOutline: async () => ({ rendered: 'CATALOG' }),
      sanitizeOutlinedRefs: async (_projectId: bigint, refs: string[]) => ({ kept: refs, dropped: [] }),
    };
    const planner = new ChapterPlanService({ getPostgresClient: () => db } as never, modelRouter as never, contextAssembler as never, { resolve: async () => ({}) } as never);
    return { planner, calls };
  }

  it('should open an empty plan without a model call, still recapping what the story owes', async () => {
    const { planner, calls } = service();

    const op = await planner.plan(7n, { chapter: 4, empty: true, intent: 'Mara sells the lamp' }, 'run-1');

    expect(calls).toEqual([]);
    expect(op).toEqual({
      op: 'brief.update',
      chapter: 4,
      body: '',
      scenes: [],
      claimedMilestones: [],
      startedEmpty: true,
      direction: 'Mara sells the lamp',
      rationale: 'What the story owes now:\n- Chapter 3 ends on "Who waits inside?"\n- The longest-quiet promise (quiet since chapter 1): The debt thread',
    });
  });

  it('should refuse an empty plan over a chapter that already has one', async () => {
    const { planner } = service(output(), [{ chapter: 4, body: 'Mara sells the lamp.' }]);

    await expect(planner.plan(7n, { chapter: 4, empty: true }, 'run-1')).rejects.toMatchObject({ code: 'PLN_007' });
  });

  it('should hand the planner the intent before the direction, and store the intent as what steered the plan', async () => {
    const { planner, calls } = service();

    const op = await planner.plan(7n, { chapter: 4, intent: 'Mara tests the lamp', direction: 'The mine floods' }, 'run-1');

    expect(calls[0]?.vars).toMatchObject({
      authorIntent: 'Mara tests the lamp',
      chosenDirection: 'The mine floods',
      chapterNumber: '4',
      endingNote: 'This chapter is not the ending.',
      milestones: expect.stringContaining('claiming it unlocks: lamp_origin'),
    });
    expect(calls[0]?.vars['catalog']).toContain('## Chapter 3: The Gate');
    expect(calls[0]?.ctx).toMatchObject({ promptKey: 'chapter-plan', promptVersion: '1.0.0', runId: 'run-1', chapter: 4 });
    expect(op).toMatchObject({ chapter: 4, direction: 'Mara tests the lamp', pov: 'mara' });
  });

  it('should tell the planner when the author plans this chapter as the ending', async () => {
    const { planner, calls } = service(output(), [{ chapter: 4, body: 'The last light.', isEnding: true }]);

    await planner.plan(7n, { chapter: 4 }, 'run-1');

    expect(calls[0]?.vars['endingNote']).toContain('as the ending of the book');
  });

  it('should propose a reveal only with a claim that meets its unlock', async () => {
    const reveal = { knowledgeContract: { pov: ['mara'], learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] } };
    const unclaimed = await service(output(reveal)).planner.plan(7n, { chapter: 4 }, 'run-1');
    const claimed = service(output({ ...reveal, claimedMilestones: ['lamp_rank_3'] }));

    const op = await claimed.planner.plan(7n, { chapter: 4 }, 'run-1');

    expect(unclaimed.knowledgeContract).toEqual({ pov: ['mara', 'ren'], learns: [] });
    expect(op).toMatchObject({ claimedMilestones: ['lamp_rank_3'], knowledgeContract: { learns: [{ entityKey: 'mara', factKey: 'lamp_origin' }] } });
    expect(claimed.calls[0]?.advice).toEqual([]);
  });
});
