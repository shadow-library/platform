import { describe, expect, it } from 'bun:test';

import { nextQuestions, QUESTION_BANK, readinessDimensions, type RouterSeedState, STRESS_READY_FIELDS, toRouterSeedState } from '@modules/ideation';
import { type Ideation } from '@server/database';

const blankSeed = (): RouterSeedState => ({ fields: {}, constraints: [], tasteAnchors: { comps: [], preferences: [] }, concepts: [], readiness: [], askedQuestions: [] });

const seedWith = (overrides: Partial<RouterSeedState>): RouterSeedState => ({ ...blankSeed(), ...overrides });

const constraint = (key: string, text: string, kind: Ideation.ConstraintKind = 'shape'): Ideation.SeedConstraint => ({ key, kind, text, lockedBy: 'author' });

const ids = (seed: RouterSeedState): string[] => nextQuestions(seed).questions.map(question => question.id);

/** Orientation already settled, so the router lands in deepen and the shape questions are visible. */
const orientedSeed = (overrides: Partial<RouterSeedState> = {}): RouterSeedState =>
  seedWith({
    ...overrides,
    fields: {
      premise: 'a tide-priest sells prophecies she no longer believes',
      genre: 'progression fantasy',
      themes: ['faith', 'debt'],
      castShape: 'one lead',
      serializationNotes: 'sixty chapters, weekly',
      ...overrides.fields,
    },
  });

const SPARK_RICH = (): RouterSeedState =>
  seedWith({
    fields: {
      premise: 'a disgraced tide-priest sells prophecies she no longer believes, to a city that keeps paying',
      themes: ['grief', 'faith', 'debt'],
    },
    constraints: [
      constraint('shelf', 'progression litRPG with a visible status window'),
      constraint('length', 'open ended, an ongoing web serial', 'scope'),
      constraint('cast', 'dual leads, bonded by the debt'),
    ],
  });

describe('question bank', () => {
  it('should give every question a unique id', () => {
    const seen = new Set(QUESTION_BANK.map(question => question.id));
    expect(seen.size).toBe(QUESTION_BANK.length);
  });

  it('should carry the escape hatch on every question', () => {
    expect(QUESTION_BANK.every(question => question.youDecide === 'commit-and-explain')).toBe(true);
  });

  it('should give every question an intent and a coaching line', () => {
    expect(QUESTION_BANK.every(question => question.intent.length > 20 && question.coaching.length > 40)).toBe(true);
  });

  it('should stop at idea altitude, asking nothing about openings or chapter structure', () => {
    const forbidden = /opening paragraph|first paragraph|chapter one|chapter breakdown|volume/i;
    expect(QUESTION_BANK.filter(question => forbidden.test(`${question.intent} ${question.coaching}`))).toEqual([]);
  });
});

describe('nextQuestions', () => {
  it('should open a blank seed on the spark question alone', () => {
    const result = nextQuestions(blankSeed());
    expect(result.stage).toBe('spark');
    expect(result.questions.map(question => question.id)).toEqual(['spark.idea']);
    expect(result.done).toBe(false);
  });

  it('should walk a blank seed spark to taste to orient', () => {
    const spark = blankSeed();
    expect(nextQuestions(spark).stage).toBe('spark');

    const taste = seedWith({ askedQuestions: ['spark.idea'] });
    expect(nextQuestions(taste).stage).toBe('taste');
    expect(ids(taste)).toEqual(['taste.comps']);

    const orient = seedWith({ askedQuestions: ['spark.idea', 'taste.comps'], tasteAnchors: { comps: ['Dungeon Crawler Carl'], preferences: ['dry narration'] } });
    expect(nextQuestions(orient).stage).toBe('orient');
  });

  it('should never ask more than three questions in a turn', () => {
    const orient = seedWith({ askedQuestions: ['spark.idea', 'taste.comps'], tasteAnchors: { comps: ['a comp'], preferences: [] } });
    expect(nextQuestions(orient).questions).toHaveLength(3);
  });

  it('should reach diverge once orientation is complete and no premise is locked', () => {
    const seed = seedWith({
      askedQuestions: ['spark.idea', 'taste.comps', 'orient.shelf', 'orient.room', 'orient.length', 'orient.tone', 'orient.cast'],
      tasteAnchors: { comps: ['a comp'], preferences: [] },
      fields: { genre: 'progression fantasy', themes: ['debt'], castShape: 'one lead', serializationNotes: 'sixty chapters, weekly' },
    });
    const result = nextQuestions(seed);
    expect(result.stage).toBe('diverge');
    expect(result.questions.map(question => question.id)).toEqual(['diverge.cards']);
  });

  it('should send a spark-rich seed straight to deepen', () => {
    const result = nextQuestions(SPARK_RICH());
    expect(result.stage).toBe('deepen');
  });

  it('should never offer diverge to a seed that already has a premise', () => {
    const seed = SPARK_RICH();
    const stages = new Set<string>();
    for (let turn = 0; turn < 20; turn++) {
      const result = nextQuestions(seed);
      stages.add(result.stage);
      if (result.questions.length === 0) break;
      seed.askedQuestions.push(...result.questions.map(question => question.id));
    }
    expect(stages.has('diverge')).toBe(false);
  });

  it('should skip taste and orientation once constraints and a premise cover them', () => {
    const seed = SPARK_RICH();
    const asked = new Set<string>();
    for (let turn = 0; turn < 20; turn++) {
      const result = nextQuestions(seed);
      if (result.questions.length === 0) break;
      for (const question of result.questions) asked.add(question.id);
      seed.askedQuestions.push(...result.questions.map(question => question.id));
    }
    expect([...asked].filter(id => id.startsWith('taste.') || id.startsWith('orient.'))).toEqual([]);
  });

  it('should force the renewal question when a constraint makes the length open-ended', () => {
    const seed = seedWith({ constraints: [constraint('length', 'open ended, an ongoing web serial', 'scope')] });
    expect(nextQuestions(seed).forced).toContain('deepen.renewal');
  });

  it('should force the renewal question when the length answer itself reads open-ended', () => {
    const seed = seedWith({ fields: { serializationNotes: 'ongoing, three chapters a week, no planned ending' } });
    expect(nextQuestions(seed).forced).toContain('deepen.renewal');
  });

  it('should force the renewal question exactly once', () => {
    const seed = orientedSeed({ constraints: [constraint('length', 'open ended serial', 'scope')] });
    const first = nextQuestions(seed);
    expect(first.stage).toBe('deepen');
    expect(first.questions.map(question => question.id)).toContain('deepen.renewal');

    const second = nextQuestions({ ...seed, askedQuestions: ['deepen.renewal'] });
    expect(second.forced).not.toContain('deepen.renewal');
    expect(second.questions.map(question => question.id)).not.toContain('deepen.renewal');
  });

  it('should force the renewal question even though the engine answer already filled its field', () => {
    const seed = orientedSeed({ constraints: [constraint('length', 'open ended serial', 'scope')], fields: { progressionSystem: 'ranks of the tide-choir' } });
    expect(nextQuestions(seed).questions.map(question => question.id)).toContain('deepen.renewal');
  });

  it('should raise the dual-leads questions at deepen', () => {
    const seed = orientedSeed({ constraints: [constraint('cast', 'dual leads, bonded')] });
    const result = nextQuestions(seed);
    expect(result.stage).toBe('deepen');
    expect(result.forced).toContain('deepen.secondLadder');
    expect(result.questions.map(question => question.id)[0]).toBe('deepen.secondLadder');
  });

  it('should raise both regression questions', () => {
    const seed = orientedSeed({ constraints: [constraint('regression', 'the lead regresses to the day before the siege')] });
    expect(nextQuestions(seed).forced).toEqual(expect.arrayContaining(['deepen.foreknowledgeDecay', 'deepen.divergence']));
  });

  it('should keep playbook questions out of a seed whose shape never invoked them', () => {
    const seed = orientedSeed();
    const shapeOnly = ['deepen.secondLadder', 'deepen.systemRules', 'deepen.povBudget', 'deepen.ironyBudget', 'deepen.stayingCost', 'deepen.deferredTension'];
    const walked = new Set<string>();
    for (let turn = 0; turn < 20; turn++) {
      const result = nextQuestions(seed);
      if (result.questions.length === 0) break;
      for (const question of result.questions) walked.add(question.id);
      seed.askedQuestions.push(...result.questions.map(question => question.id));
    }
    expect(shapeOnly.filter(id => walked.has(id))).toEqual([]);
  });

  it('should let an unmatched constraint lock without contributing a question', () => {
    const seed = orientedSeed({ constraints: [constraint('epistolary', 'the whole thing is told through salvage manifests')] });
    const result = nextQuestions(seed);
    expect(result.stage).toBe('deepen');
    expect(result.forced).toEqual([]);
  });

  it('should never repeat a question once it is recorded as asked', () => {
    const seed = blankSeed();
    const seen: string[] = [];
    for (let turn = 0; turn < 30; turn++) {
      const result = nextQuestions(seed);
      if (result.questions.length === 0) break;
      for (const question of result.questions) seen.push(question.id);
      seed.askedQuestions.push(...result.questions.map(question => question.id));
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('should terminate on the stress stage when every question has been asked', () => {
    const seed = seedWith({ askedQuestions: QUESTION_BANK.map(question => question.id) });
    const result = nextQuestions(seed);
    expect(result.stage).toBe('stress');
    expect(result.questions).toEqual([]);
  });

  it('should offer the readiness question at the stress stage', () => {
    const seed = seedWith({ askedQuestions: QUESTION_BANK.filter(question => question.stage !== 'stress').map(question => question.id) });
    const result = nextQuestions(seed);
    expect(result.stage).toBe('stress');
    expect(result.questions.map(question => question.id)).toEqual(['stress.readiness']);
  });

  it('should report done only when every stress-ready field is filled', () => {
    const fields = Object.fromEntries(STRESS_READY_FIELDS.map(field => [field, 'settled'])) as Ideation.SeedFields;
    expect(nextQuestions(seedWith({ fields })).done).toBe(true);
    expect(nextQuestions(seedWith({ fields: { ...fields, voice: '' } })).done).toBe(false);
    expect(nextQuestions(blankSeed()).done).toBe(false);
  });
});

describe('toRouterSeedState', () => {
  it('should normalise every nullable column of a fresh row', () => {
    const state = toRouterSeedState({ fields: null, constraints: null, tasteAnchors: null, concepts: null, readiness: null, askedQuestions: null });
    expect(state).toEqual(blankSeed());
  });

  it('should keep the columns a populated row already carries', () => {
    const seed = SPARK_RICH();
    const state = toRouterSeedState(seed);
    expect(state.constraints).toHaveLength(3);
    expect(state.fields.premise).toBe(seed.fields.premise as string);
  });
});

describe('readinessDimensions', () => {
  it('should report the seven dimensions in a stable order', () => {
    expect(readinessDimensions(blankSeed()).map(dimension => dimension.dimension)).toEqual(['hook', 'protagonist', 'engine', 'ladder', 'promise', 'voice', 'room']);
  });

  it('should report every dimension of a blank seed as empty', () => {
    expect(readinessDimensions(blankSeed()).every(dimension => dimension.verdict === 'empty')).toBe(true);
  });

  it('should report a single-field dimension as strong once its field is filled', () => {
    const dimensions = readinessDimensions(seedWith({ fields: { hook: 'the prophecy she sold came true' } }));
    expect(dimensions.find(dimension => dimension.dimension === 'hook')).toMatchObject({ verdict: 'strong', present: ['hook'] });
  });

  it('should report a two-field dimension as thin while only one field is filled', () => {
    const dimensions = readinessDimensions(seedWith({ fields: { protagonistDrive: 'clear her brother from the ledger' } }));
    expect(dimensions.find(dimension => dimension.dimension === 'protagonist')).toMatchObject({ verdict: 'thin', present: ['protagonistDrive'] });
  });

  it('should report a two-field dimension as strong once both fields are filled', () => {
    const dimensions = readinessDimensions(seedWith({ fields: { genre: 'progression fantasy', premise: 'a tide-priest sells prophecies' } }));
    expect(dimensions.find(dimension => dimension.dimension === 'room')).toMatchObject({ verdict: 'strong' });
  });

  it('should count a locked promise constraint as a source for the promise dimension', () => {
    const dimensions = readinessDimensions(seedWith({ constraints: [constraint('no-harem', 'one romance only', 'promise')] }));
    expect(dimensions.find(dimension => dimension.dimension === 'promise')).toMatchObject({ verdict: 'thin', present: [] });
  });

  it('should count a locked scope constraint as a source for the room dimension', () => {
    const dimensions = readinessDimensions(seedWith({ constraints: [constraint('room', 'a drowned cathedral city', 'scope')] }));
    expect(dimensions.find(dimension => dimension.dimension === 'room')).toMatchObject({ verdict: 'thin', present: [] });
  });

  it('should ignore whitespace-only field values', () => {
    const dimensions = readinessDimensions(seedWith({ fields: { voice: '   ' } }));
    expect(dimensions.find(dimension => dimension.dimension === 'voice')?.verdict).toBe('empty');
  });
});
