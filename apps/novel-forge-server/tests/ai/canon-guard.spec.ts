import { describe, expect, it } from 'bun:test';

import {
  findArcRevealViolations,
  findBriefRevealViolations,
  isLimitCategory,
  renderHardLimits,
  renderRevealSchedule,
  renderRevealViolation,
  revealGuard,
  sanitiseArcReveals,
  sanitiseBriefReveals,
  type ScheduledReveal,
  scheduledReveals,
  shiftRevealsForInsert,
} from '@modules/ai/context/canon-guard';
import { CatalogService } from '@modules/ai/context/catalog.service';
import { buildArcPlanPrompt, buildOutlinePrompt } from '@modules/ai/prompts';
import { resolveWordTarget } from '@modules/eval/deterministic-metrics';

const bellRinger: ScheduledReveal = {
  factKey: 'bell_ringer_is_heir',
  revealChapter: 12,
  terms: ['cracked bell', 'Orrin Vale'],
  writerNote: 'The bell ringer is more than he seems.',
};
const floodedCrypt: ScheduledReveal = { factKey: 'crypt_was_flooded', revealChapter: 5, terms: ['sunken crypt'], writerNote: null };

const scene = (goal: string) => ({ goal, obstacle: 'the warden', turn: 'the toll doubles', beats: ['Wren argues', 'the warden relents'], estimatedWords: 700 });

function brief(chapter: number, overrides: Record<string, unknown> = {}) {
  return {
    chapter,
    volumeKey: 'vol_01_the_marsh',
    title: `Chapter ${chapter}`,
    objective: 'Wren crosses the marsh road before the toll closes.',
    events: ['Wren bargains with the ferry warden', 'the lanterns go out on the causeway'],
    scenes: [scene('Wren bargains with the ferry warden'), scene('Wren crosses the causeway'), scene('Wren relights the lanterns')],
    requiredContext: [],
    continuesIntoNextChapter: false,
    startsFromPreviousChapter: false,
    endingContract: {
      hookType: 'turn',
      emotionalBeat: 'unease',
      openQuestion: 'who put the lanterns out?',
      handoffState: 'Wren alone on the causeway',
      mustNotResolve: [],
    },
    chapterPurpose: 'Strands Wren between two factions.',
    readerValue: ['goal_or_plan_change'],
    ...overrides,
  };
}

function arc(arcKey: string, chapterStart: number, chapterEnd: number, overrides: Record<string, unknown> = {}) {
  return {
    arcKey,
    title: 'The Toll Road',
    objective: 'Wren earns passage.',
    escalation: 'The wardens close ranks.',
    payoff: 'Wren reaches the abbey.',
    hook: 'The abbey gate is already open.',
    chapterStart,
    chapterEnd,
    cast: [],
    body: 'Marsh politics.',
    ideas: [],
    ...overrides,
  };
}

describe('scheduledReveals', () => {
  it('should keep only scheduled non-seed facts, ordered by reveal chapter then key', () => {
    const reveals = scheduledReveals([
      { factKey: 'zeta', revealChapter: 9, terms: ['  ', 'zeta word'], source: 'manual', writerNote: null },
      { factKey: 'alpha', revealChapter: 9, terms: null, source: 'import', writerNote: null },
      { factKey: 'early', revealChapter: 2, terms: [], source: 'generated', writerNote: null },
      { factKey: 'unscheduled', revealChapter: null, terms: ['x'], source: 'manual', writerNote: null },
      { factKey: 'promise', revealChapter: 4, terms: [], source: 'seed', writerNote: null },
    ]);

    expect(reveals).toEqual([
      { factKey: 'early', revealChapter: 2, terms: [], writerNote: null },
      { factKey: 'alpha', revealChapter: 9, terms: [], writerNote: null },
      { factKey: 'zeta', revealChapter: 9, terms: ['zeta word'], writerNote: null },
    ]);
  });
});

describe('shiftRevealsForInsert', () => {
  it('should move only the reveals after the insert point one chapter later', () => {
    expect(shiftRevealsForInsert([floodedCrypt, bellRinger], 5)).toEqual([floodedCrypt, { ...bellRinger, revealChapter: 13 }]);
  });
});

describe('renderRevealSchedule', () => {
  it('should scope the schedule to the span, dropping reveals already public at its start', () => {
    const early: ScheduledReveal = { factKey: 'old_news', revealChapter: 3, terms: [], writerNote: null };
    const { lines, omitted } = renderRevealSchedule([early, floodedCrypt, bellRinger], { start: 4, end: 8 });

    expect(omitted).toBe(0);
    expect(lines).toEqual([
      'crypt_was_flooded — reveals ch 5: nothing before ch 5 may surface it; never name: sunken crypt',
      'bell_ringer_is_heir — reveals ch 12: hidden for this whole span; never name: cracked bell, Orrin Vale',
    ]);
  });

  it('should guard exactly the reveals it renders when its budget runs out', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ factKey: `secret_${i}`, revealChapter: 50 + i, terms: ['a long give-away phrase', 'another one'], writerNote: null }));
    const span = { start: 1, end: 10 };
    const { lines, omitted } = renderRevealSchedule(many, span);
    const guarded = revealGuard(many, span).advised;

    expect(lines.length).toBeGreaterThan(0);
    expect(omitted).toBe(400 - lines.length);
    expect(guarded.map(reveal => reveal.factKey)).toEqual(lines.map(line => line.split(' — ')[0]));
  });
});

describe('renderHardLimits', () => {
  it('should list power rules then limit-like world facts, each with its citable ref', () => {
    const { lines } = renderHardLimits(
      [
        { entityKey: 'emberweave', type: 'power_rule', body: 'Emberweave only warms what it touches; it can never cool or quench.', notes: null },
        { entityKey: 'wren', type: 'character', body: 'A ferry thief.', notes: null },
        { entityKey: 'empty_rule', type: 'power_rule', body: null, notes: '  ' },
      ],
      [
        { category: 'power_limits', key: 'no_self_healing', value: 'A weaver cannot mend their own burns.' },
        { category: 'geography', key: 'marsh_width', value: 'The marsh is a day across.' },
        { category: 'costs', key: 'ember_price', value: 'Each weaving costs a night of sleep.' },
      ],
    );

    expect(lines).toEqual([
      'entity:emberweave — Emberweave only warms what it touches; it can never cool or quench.',
      'world_fact:costs/ember_price — Each weaving costs a night of sleep.',
      'world_fact:power_limits/no_self_healing — A weaver cannot mend their own burns.',
    ]);
  });

  it('should recognise limit categories by whole word, singular or plural', () => {
    expect(['limits', 'power_system', 'World Rules', 'forbidden-arts', 'constraint'].map(isLimitCategory)).toEqual([true, true, true, true, true]);
    expect(['geography', 'politics', 'lawn_games', 'powerhouse'].map(isLimitCategory)).toEqual([false, false, false, false]);
  });
});

describe('findBriefRevealViolations', () => {
  it('should flag a brief that names a fact term before its reveal chapter', () => {
    const violations = findBriefRevealViolations([brief(4, { events: ['Wren hears the cracked bell toll at midnight'] })], [bellRinger]);

    expect(violations).toEqual([{ subject: 'chapter 4', field: 'events[0]', factKey: 'bell_ringer_is_heir', revealChapter: 12 }]);
  });

  it('should flag a knowledge contract that learns a fact early, once per fact', () => {
    const learns = { pov: ['wren'], learns: [{ entityKey: 'wren', factKey: 'bell_ringer_is_heir' }] };
    const violations = findBriefRevealViolations([brief(7, { objective: 'Orrin Vale confesses.', knowledgeContract: learns })], [bellRinger]);

    expect(violations).toEqual([{ subject: 'chapter 7', field: 'knowledgeContract.learns', factKey: 'bell_ringer_is_heir', revealChapter: 12 }]);
  });

  it('should flag a scene beat that names a fact term before its reveal chapter', () => {
    const leakyScene = { ...scene('Wren climbs the tower'), beats: ['Wren climbs', 'the cracked bell tolls'] };
    const violations = findBriefRevealViolations([brief(4, { events: undefined, scenes: [leakyScene] })], [bellRinger]);

    expect(violations).toEqual([{ subject: 'chapter 4', field: 'scenes[0].beats[1]', factKey: 'bell_ringer_is_heir', revealChapter: 12 }]);
  });

  it('should allow a fact from its reveal chapter onward', () => {
    const overrides = { objective: 'Orrin Vale rings the cracked bell.', knowledgeContract: { learns: [{ factKey: 'bell_ringer_is_heir' }] } };

    expect(
      findBriefRevealViolations(
        [12, 13].map(chapter => brief(chapter, overrides)),
        [bellRinger],
      ),
    ).toEqual([]);
  });

  it('should match whole words only', () => {
    const overrides = { objective: 'The sunken crypts of the old town are mapped.', endingContract: { hookType: 'turn', mustNotResolve: ['crypt_was_flooded'] } };

    expect(findBriefRevealViolations([brief(3, overrides)], [floodedCrypt])).toEqual([]);
  });

  it('should flag a mustNotResolve entry that names a term, since it reaches the writer verbatim', () => {
    const overrides = { endingContract: { hookType: 'turn', mustNotResolve: ['crypt_was_flooded', 'the sunken crypt stays sealed'] } };

    expect(findBriefRevealViolations([brief(3, overrides)], [floodedCrypt])).toEqual([
      { subject: 'chapter 3', field: 'endingContract.mustNotResolve[1]', factKey: 'crypt_was_flooded', revealChapter: 5 },
    ]);
  });

  it('should match a capitalised term case-sensitively, so a name never fires on a common word', () => {
    const heirName: ScheduledReveal = { factKey: 'heir_is_named_will', revealChapter: 20, terms: ['Will'], writerNote: null };

    expect(findBriefRevealViolations([brief(2, { objective: 'Mara will cross the river' })], [heirName])).toEqual([]);
    expect(findBriefRevealViolations([brief(2, { objective: 'Mara meets Will at the river' })], [heirName])).toHaveLength(1);
  });

  it('should never scan the bare fact key', () => {
    const curse: ScheduledReveal = { factKey: 'curse', revealChapter: 20, terms: [], writerNote: null };

    expect(findBriefRevealViolations([brief(2, { objective: 'Rumours of a curse spread' })], [curse])).toEqual([]);
  });

  it('should render a violation with its field path and fact key but never the give-away term', () => {
    const [violation] = findBriefRevealViolations([brief(4, { title: 'The Cracked Bell' })], [bellRinger]);
    const rendered = violation ? renderRevealViolation(violation) : '';

    expect(rendered).toBe('chapter 4 title names a REVEAL SCHEDULE term of bell_ringer_is_heir, whose reveal is scheduled for chapter 12 — keep it out until then');
    expect(rendered.toLowerCase()).not.toContain('cracked bell');
  });
});

describe('findArcRevealViolations', () => {
  it('should flag an arc that surfaces a fact revealed after it ends, but not the arc that contains the reveal', () => {
    const arcs = [arc('arc_one', 1, 8, { ideas: ['a sermon about the cracked bell'] }), arc('arc_two', 9, 14, { payoff: 'Orrin Vale is unmasked.' })];

    expect(findArcRevealViolations(arcs, [bellRinger])).toEqual([{ subject: 'arc arc_one', field: 'ideas[0]', factKey: 'bell_ringer_is_heir', revealChapter: 12 }]);
  });
});

describe('sanitiseBriefReveals', () => {
  const leaky = [
    brief(4, {
      title: 'The Cracked Bell',
      objective: 'Wren reaches the tower. Orrin Vale confesses everything! The warden follows.',
      events: ['Wren hears the cracked bell', 'the lanterns go out'],
      chapterPurpose: 'Orrin Vale is unmasked.',
      handoffBeat: 'Wren on the stair.',
      repetitionRisks: ['another cracked bell scene', 'another ferry bargain'],
      endingContract: { hookType: 'revelation', emotionalBeat: 'dread', openQuestion: 'Is Orrin Vale the heir?', handoffState: 'Wren alone', mustNotResolve: [] },
      knowledgeContract: { pov: ['wren'], learns: [{ entityKey: 'wren', factKey: 'bell_ringer_is_heir' }] },
    }),
    brief(5, { events: ['Wren digs into the sunken crypt'] }),
    brief(12, { objective: 'Orrin Vale rings the cracked bell.' }),
  ];

  it('should rewrite every field that surfaces a reveal early, field by field', () => {
    const { briefs } = sanitiseBriefReveals(leaky, [floodedCrypt, bellRinger]);
    const [four, five, twelve] = briefs as Record<string, unknown>[];

    expect(four?.title).toBe('The bell ringer is more than he seems.');
    expect(four?.objective).toBe('Wren reaches the tower. The bell ringer is more than he seems. The warden follows.');
    expect(four?.events).toEqual(['the lanterns go out']);
    expect(four?.chapterPurpose).toBe('The bell ringer is more than he seems.');
    expect(four?.handoffBeat).toBe('Wren on the stair.');
    expect(four?.repetitionRisks).toEqual(['another ferry bargain']);
    expect(four?.endingContract).toEqual({
      hookType: 'revelation',
      emotionalBeat: 'dread',
      openQuestion: 'The bell ringer is more than he seems.',
      handoffState: 'Wren alone',
      mustNotResolve: [],
    });
    expect(four?.knowledgeContract).toEqual({ pov: ['wren'], learns: [] });
    expect(five?.events).toEqual(['Wren digs into the sunken crypt']);
    expect(twelve).toBe(leaky[2]);
  });

  it('should rewrite a leaking scene field by field and keep its words and at least one beat', () => {
    const leakyScene = { goal: 'Orrin Vale confesses.', obstacle: 'the warden', turn: 'Wren runs', beats: ['the cracked bell tolls'], estimatedWords: 800 };
    const { briefs, sanitised } = sanitiseBriefReveals([brief(4, { events: undefined, scenes: [leakyScene] })], [bellRinger]);
    const [sanitisedScene] = (briefs[0] as { scenes: Record<string, unknown>[] }).scenes;

    expect(sanitisedScene).toEqual({
      goal: 'The bell ringer is more than he seems.',
      obstacle: 'the warden',
      turn: 'Wren runs',
      beats: ['(withheld until ch 12)'],
      estimatedWords: 800,
    });
    expect(sanitised.map(({ field }) => field)).toEqual(['scenes[0].beats[0]', 'scenes[0].goal']);
  });

  it('should leave a persisted outline with zero reveal violations and the blocking outline rules intact', () => {
    const outline = [3, 4].map(chapter =>
      brief(chapter, { title: 'Sunken crypt', objective: 'Into the sunken crypt.', events: ['The sunken crypt floods.'], chapterPurpose: 'The sunken crypt.' }),
    );
    const prompt = buildOutlinePrompt(3, 4, resolveWordTarget(), [floodedCrypt]);

    const { briefs, sanitised } = sanitiseBriefReveals(outline, [floodedCrypt, bellRinger]);

    expect(findBriefRevealViolations(briefs, [floodedCrypt, bellRinger])).toEqual([]);
    expect(prompt.postValidate?.(briefs as never)).toEqual([]);
    expect(briefs[0]?.title).toBe('(withheld until ch 5)');
    expect(briefs[0]?.events).toEqual(['(withheld until ch 5)']);
    expect(sanitised.map(({ subject, field }) => `${subject} ${field}`)).toEqual([
      'chapter 3 events[0]',
      'chapter 3 title',
      'chapter 3 objective',
      'chapter 3 chapterPurpose',
      'chapter 4 events[0]',
      'chapter 4 title',
      'chapter 4 objective',
      'chapter 4 chapterPurpose',
    ]);
  });

  it('should drop a mustNotResolve entry that names a term and keep fact-key entries', () => {
    const traitor: ScheduledReveal = { factKey: 'orin_is_the_traitor', revealChapter: 9, terms: ['Orin is the traitor'], writerNote: null };
    const contract = { hookType: 'turn', emotionalBeat: 'dread', openQuestion: 'who?', handoffState: 'dusk', mustNotResolve: ['Orin is the traitor', 'orin_is_the_traitor'] };

    const { briefs } = sanitiseBriefReveals([brief(2, { endingContract: contract })], [traitor]);

    expect(briefs[0]?.endingContract).toMatchObject({ mustNotResolve: ['orin_is_the_traitor'] });
    expect(findBriefRevealViolations(briefs, [traitor])).toEqual([]);
  });

  it('should use a writer note once per field when several sentences it replaces', () => {
    const { briefs } = sanitiseBriefReveals([brief(4, { objective: 'The cracked bell rings. Orrin Vale smiles. Wren runs.' })], [bellRinger]);

    expect(briefs[0]?.objective).toBe('The bell ringer is more than he seems. Wren runs.');
  });

  it('should log the sanitisation without the give-away term', () => {
    const { sanitised } = sanitiseBriefReveals(leaky, [bellRinger]);

    expect(JSON.stringify(sanitised)).not.toMatch(/cracked bell|Orrin Vale/i);
    expect(sanitised).toContainEqual({ subject: 'chapter 4', field: 'knowledgeContract.learns', factKey: 'bell_ringer_is_heir', revealChapter: 12 });
  });
});

describe('sanitiseArcReveals', () => {
  it('should rewrite an early arc to zero violations and leave its chapter range alone', () => {
    const arcs = [
      arc('arc_one', 1, 8, { hook: 'Orrin Vale steps out of the bell tower.', ideas: ['a sermon about the cracked bell', 'a flooded road'] }),
      arc('arc_two', 9, 14, { payoff: 'Orrin Vale is unmasked.' }),
    ];

    const { arcs: safe, sanitised } = sanitiseArcReveals(arcs, [bellRinger]);

    expect(findArcRevealViolations(safe, [bellRinger])).toEqual([]);
    expect(safe[0]).toMatchObject({ chapterStart: 1, chapterEnd: 8, hook: 'The bell ringer is more than he seems.', ideas: ['a flooded road'] });
    expect(safe[1]).toBe(arcs[1]);
    expect(buildArcPlanPrompt(1, 14).postValidate?.({ arcs: safe } as never)).toEqual([]);
    expect(sanitised.map(({ field }) => field)).toEqual(['hook', 'ideas[0]']);
  });
});

describe('planning prompt gates', () => {
  it('should keep coverage blocking and make an early reveal advisory in the outline prompt', () => {
    const prompt = buildOutlinePrompt(4, 5, resolveWordTarget(), [bellRinger]);
    const briefs = [brief(4, { title: 'The Cracked Bell' })] as never;

    expect(prompt.postValidate?.(briefs)).toEqual(['chapter 5 is missing from the outline']);
    expect(prompt.advise?.(briefs)).toEqual([
      'chapter 4 title names a REVEAL SCHEDULE term of bell_ringer_is_heir, whose reveal is scheduled for chapter 12 — keep it out until then',
    ]);
  });

  it('should keep coverage blocking and make an early reveal advisory in the arc-plan prompt', () => {
    const prompt = buildArcPlanPrompt(1, 8, [bellRinger]);
    const output = { arcs: [arc('arc_one', 1, 8, { hook: 'Orrin Vale steps out of the bell tower.' })] } as never;

    expect(prompt.postValidate?.(output)).toEqual([]);
    expect(prompt.advise?.(output)).toEqual([
      'arc arc_one hook names a REVEAL SCHEDULE term of bell_ringer_is_heir, whose reveal is scheduled for chapter 12 — keep it out until then',
    ]);
  });
});

describe('catalog canon guard', () => {
  function stubCatalog(rows: { entities?: unknown[]; worldFacts?: unknown[]; canonFacts?: unknown[] }): CatalogService {
    const table = (data: unknown[] = []) => ({ findMany: async () => data });
    const db = {
      query: {
        chapters: table(),
        volumes: table(),
        entities: table(rows.entities),
        worldFacts: table(rows.worldFacts),
        plotThreads: table(),
        mysteries: table(),
        canonFacts: table(rows.canonFacts),
        characterKnowledge: table(),
        bibleDocuments: table(),
      },
    };
    return new CatalogService({ getPostgresClient: () => db } as never);
  }

  const rows = {
    entities: [{ entityKey: 'emberweave', type: 'power_rule', status: 'active', significance: 'major', body: 'Emberweave only warms; it never cools.', notes: null }],
    worldFacts: [{ category: 'limits', key: 'one_weave_a_day', value: 'A weaver weaves once between dawns.' }],
    canonFacts: [{ id: 1n, factKey: 'bell_ringer_is_heir', text: 'The bell ringer is the lost heir.', terms: ['cracked bell'], revealChapter: 12, source: 'manual' }],
  };

  it('should add the scoped reveal schedule and hard limits only when a span is given', async () => {
    const catalog = stubCatalog(rows);
    const plain = await catalog.render(1n);
    const planning = await catalog.render(1n, { span: { start: 4, end: 8 } });

    expect(plain).not.toContain('REVEAL SCHEDULE');
    expect(plain).not.toContain('HARD LIMITS');
    expect(planning).toContain(
      ['REVEAL SCHEDULE (binding for chapters 4–8):', 'bell_ringer_is_heir — reveals ch 12: hidden for this whole span; never name: cracked bell'].join('\n'),
    );
    expect(planning).toContain(
      [
        'HARD LIMITS (no planned event may break these):',
        'entity:emberweave — Emberweave only warms; it never cools.',
        'world_fact:limits/one_weave_a_day — A weaver weaves once between dawns.',
      ].join('\n'),
    );
  });

  it('should leave the schedule out once the span starts at or after every reveal', async () => {
    const rendered = await stubCatalog(rows).render(1n, { span: { start: 12, end: 16 } });

    expect(rendered).not.toContain('REVEAL SCHEDULE');
    expect(rendered).toContain('HARD LIMITS');
  });

  it('should render reveal chapters at their post-insert numbers, in the schedule and the canon facts alike', async () => {
    const rendered = await stubCatalog(rows).render(1n, { span: { start: 12, end: 12 }, insertAfter: 11 });

    expect(rendered).toContain('bell_ringer_is_heir: The bell ringer is the lost heir. (unrevealed; scheduled ch 13)');
    expect(rendered).toContain('bell_ringer_is_heir — reveals ch 13: hidden for this whole span');
  });

  it('should never trim the reveal schedule to meet the catalog ceiling', async () => {
    const crowded = {
      ...rows,
      entities: Array.from({ length: 20 }, (_, i) => ({ entityKey: `bystander_${i}`, type: 'character', body: 'Walks the causeway at dusk.', notes: null })),
    };
    const rendered = await stubCatalog(crowded).render(1n, { span: { start: 4, end: 8 }, maxTokens: 300 });

    expect(rendered).toContain('bell_ringer_is_heir — reveals ch 12: hidden for this whole span');
    expect(rendered).toContain('minor entities omitted');
  });
});
