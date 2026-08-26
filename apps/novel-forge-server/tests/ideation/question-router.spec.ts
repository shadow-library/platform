import { describe, expect, it } from 'bun:test';

import { nextQuestions, QUESTION_BANK, readinessDimensions, recordOffered, type RouterSeedState, SEED_FIELD_KEYS, STRESS_READY_FIELDS, toRouterSeedState } from '@modules/ideation';
import { type Ideation } from '@server/database';

const blankSeed = (): RouterSeedState => ({ fields: {}, constraints: [], tasteAnchors: { comps: [], preferences: [] }, concepts: [], readiness: [], askedQuestions: [] });

const seedWith = (overrides: Partial<RouterSeedState>): RouterSeedState => ({ ...blankSeed(), ...overrides });

const constraint = (key: string, text: string, kind: Ideation.ConstraintKind = 'shape'): Ideation.SeedConstraint => ({ key, kind, text, lockedBy: 'author' });

const ids = (seed: RouterSeedState): string[] => nextQuestions(seed).questions.map(question => question.id);

/** Orientation already settled, so the router lands in deepen and the shape questions are visible. */
const orientedSeed = (overrides: Partial<RouterSeedState> = {}): RouterSeedState =>
  seedWith({
    ...overrides,
    askedQuestions: ['orient.room', ...(overrides.askedQuestions ?? [])],
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

  it('should fill only fields the sheet actually has', () => {
    const unknown = QUESTION_BANK.flatMap(question => question.fills).filter(field => !SEED_FIELD_KEYS.includes(field));
    expect(unknown).toEqual([]);
  });

  it('should stop at idea altitude, asking nothing about openings or chapter structure', () => {
    const numbered = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|[0-9]+';
    const forbidden = new RegExp(`\\b(?:opening paragraph|first paragraph|first scene|opening beat|prologue|act one|chapter breakdown|volume|chapter (?:${numbered}))\\b`, 'i');
    expect(QUESTION_BANK.filter(question => forbidden.test(`${question.intent} ${question.coaching}`)).map(question => question.id)).toEqual([]);
  });

  it('should not trip its own altitude ceiling on words that merely contain a forbidden one', () => {
    const numbered = 'one|two|three|[0-9]+';
    const forbidden = new RegExp(`\\b(?:volume|chapter (?:${numbered}))\\b`, 'i');
    expect(forbidden.test('a voluminous prologue-adjacent chapters list')).toBe(false);
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

  it('should still ask a spark-rich seed the orientation questions that fill stress-ready fields', () => {
    const result = nextQuestions(SPARK_RICH());
    expect(result.stage).toBe('orient');
    expect(result.questions.map(question => question.id)).toContain('orient.shelf');
  });

  it('should send a spark-rich seed to deepen once orientation is on the sheet', () => {
    const seed = SPARK_RICH();
    seed.fields.genre = 'progression litRPG';
    seed.fields.castShape = 'dual leads, bonded by the debt';
    seed.askedQuestions.push('orient.shelf', 'orient.room', 'orient.tone', 'orient.cast');
    expect(nextQuestions(seed).stage).toBe('deepen');
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

  it('should skip the spark and taste rounds once constraints and a premise cover them', () => {
    const seed = SPARK_RICH();
    const asked = new Set<string>();
    for (let turn = 0; turn < 20; turn++) {
      const result = nextQuestions(seed);
      if (result.questions.length === 0) break;
      for (const question of result.questions) asked.add(question.id);
      seed.askedQuestions = recordOffered(seed, result);
    }
    expect([...asked].filter(id => id.startsWith('spark.') || id.startsWith('taste.') || id === 'orient.length')).toEqual([]);
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

  it('should leave the engine question as the only filler of the progression system', () => {
    expect(QUESTION_BANK.filter(question => question.fills.includes('progressionSystem')).map(question => question.id)).toEqual(['deepen.engine']);
  });

  it('should hint at a locked cast shape rather than let the turn re-ask it', () => {
    const seed = seedWith({
      askedQuestions: ['spark.idea', 'taste.comps', 'orient.shelf', 'orient.room', 'orient.length'],
      constraints: [constraint('cast', 'dual leads, bonded by the debt')],
    });
    const result = nextQuestions(seed);
    expect(result.questions.map(question => question.id)).toContain('orient.cast');
    expect(result.hints['orient.cast']).toBe('Locked already: dual leads. Confirm rather than re-ask.');
  });

  it('should leave a question without a locked decision unhinted', () => {
    const seed = seedWith({ askedQuestions: ['spark.idea', 'taste.comps'] });
    expect(nextQuestions(seed).hints).toEqual({});
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

  it('should never repeat a question while the stage walk still has fresh ones', () => {
    const seed = blankSeed();
    const seen: string[] = [];
    for (let turn = 0; turn < 30; turn++) {
      const result = nextQuestions(seed);
      if (result.backfilled.length > 0) break;
      for (const question of result.questions) seen.push(question.id);
      seed.askedQuestions = recordOffered(seed, result);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('should terminate on the stress stage when every question has been asked and the sheet is finished', () => {
    const fields = Object.fromEntries(STRESS_READY_FIELDS.map(field => [field, 'settled'])) as Ideation.SeedFields;
    const result = nextQuestions(seedWith({ fields, askedQuestions: QUESTION_BANK.map(question => question.id) }));
    expect(result.stage).toBe('stress');
    expect(result.questions).toEqual([]);
    expect(result.done).toBe(true);
  });

  it('should re-offer the fillers of the missing fields when every question has been asked but the sheet is not finished', () => {
    const result = nextQuestions(seedWith({ askedQuestions: QUESTION_BANK.map(question => question.id) }));
    expect(result.stage).toBe('stress');
    expect(result.done).toBe(false);
    expect(result.backfilled).toEqual(result.questions.map(question => question.id));
    expect(result.backfilled).toEqual(['orient.shelf', 'orient.cast', 'diverge.cards']);
  });

  it('should not offer the readiness question while stress-ready fields are still missing', () => {
    const seed = seedWith({ askedQuestions: QUESTION_BANK.filter(question => question.stage !== 'stress').map(question => question.id) });
    const result = nextQuestions(seed);
    expect(result.stage).toBe('stress');
    expect(result.done).toBe(false);
    expect(result.questions.map(question => question.id)).not.toContain('stress.readiness');
    expect(result.backfilled).toEqual(result.questions.map(question => question.id));
  });

  it('should offer stress.readiness exactly once, on the finished sheet, before reporting done', () => {
    const seed = blankSeed();
    let readinessOffers = 0;
    let finishedTurn = -1;

    for (let turn = 0; turn < 40; turn++) {
      const result = nextQuestions(seed);
      if (result.questions.length === 0) {
        expect(result.done).toBe(true);
        finishedTurn = turn;
        break;
      }
      if (result.questions.some(question => question.id === 'stress.readiness')) {
        readinessOffers += 1;
        expect(result.done).toBe(true);
      }
      for (const question of result.questions) for (const field of question.fills) seed.fields[field] = 'settled' as never;
      seed.askedQuestions = recordOffered(seed, result);
    }

    expect(readinessOffers).toBe(1);
    expect(finishedTurn).toBeGreaterThan(-1);
  });

  it('should backfill the expert filler for a missing hook ahead of the suppressed diverge question', () => {
    const fields = { ...Object.fromEntries(STRESS_READY_FIELDS.map(field => [field, 'settled'])), hook: '' } as Ideation.SeedFields;
    const seed = seedWith({ fields, askedQuestions: QUESTION_BANK.map(question => question.id) });
    const result = nextQuestions(seed);
    expect(result.stage).toBe('stress');
    expect(result.done).toBe(false);
    expect(result.backfilled).toEqual(['deepen.hook']);
    expect(result.questions.map(question => question.id)).not.toContain('diverge.cards');
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
    const dimensions = readinessDimensions(seedWith({ fields: { protagonistDrive: 'clear her brother from the ledger', castShape: 'one lead' } }));
    expect(dimensions.find(dimension => dimension.dimension === 'protagonist')).toMatchObject({ verdict: 'strong' });
  });

  it('should read the engine dimension off the stakes and the ladder off the progression system', () => {
    const dimensions = readinessDimensions(seedWith({ fields: { stakes: 'the ledger takes her name next' } }));
    expect(dimensions.find(dimension => dimension.dimension === 'engine')).toMatchObject({ verdict: 'strong', present: ['stakes'] });
    expect(dimensions.find(dimension => dimension.dimension === 'ladder')).toMatchObject({ verdict: 'empty', present: [] });
  });

  it('should read the promise dimension off the locked promise constraints rather than the length answer', () => {
    const withLength = readinessDimensions(seedWith({ fields: { serializationNotes: 'sixty chapters, weekly' } }));
    expect(withLength.find(dimension => dimension.dimension === 'promise')?.verdict).toBe('empty');

    const withPromise = readinessDimensions(seedWith({ constraints: [constraint('no-harem', 'one romance only', 'promise')] }));
    expect(withPromise.find(dimension => dimension.dimension === 'promise')).toMatchObject({ verdict: 'strong', present: [] });
  });

  it('should read the room dimension off the genre and a room-keyed constraint, and let it reach strong', () => {
    const genreOnly = readinessDimensions(seedWith({ fields: { genre: 'progression fantasy' } }));
    expect(genreOnly.find(dimension => dimension.dimension === 'room')?.verdict).toBe('thin');

    const constraintOnly = readinessDimensions(seedWith({ constraints: [constraint('setting', 'a drowned cathedral city', 'scope')] }));
    expect(constraintOnly.find(dimension => dimension.dimension === 'room')).toMatchObject({ verdict: 'thin', present: [] });

    const both = readinessDimensions(seedWith({ fields: { genre: 'progression fantasy' }, constraints: [constraint('room', 'a drowned cathedral city', 'scope')] }));
    expect(both.find(dimension => dimension.dimension === 'room')?.verdict).toBe('strong');
  });

  it('should not read a length lock as a room source', () => {
    const dimensions = readinessDimensions(seedWith({ constraints: [constraint('length', 'sixty chapters', 'scope')] }));
    expect(dimensions.find(dimension => dimension.dimension === 'room')?.verdict).toBe('empty');
  });

  it('should ignore whitespace-only field values', () => {
    const dimensions = readinessDimensions(seedWith({ fields: { voice: '   ' } }));
    expect(dimensions.find(dimension => dimension.dimension === 'voice')?.verdict).toBe('empty');
  });
});

describe('the room question', () => {
  it('should be asked when the only scope constraint is the length lock', () => {
    const seed = seedWith({ askedQuestions: ['spark.idea', 'taste.comps'], constraints: [constraint('length', 'sixty chapters, weekly', 'scope')] });
    expect(nextQuestions(seed).questions.map(question => question.id)).toContain('orient.room');
  });

  it('should be skipped only by a constraint that names the room itself', () => {
    const seed = seedWith({ askedQuestions: ['spark.idea', 'taste.comps'], constraints: [constraint('setting', 'a drowned cathedral city', 'scope')] });
    expect(nextQuestions(seed).questions.map(question => question.id)).not.toContain('orient.room');
  });

  it('should be asked when a room-keyed constraint was locked under the wrong kind', () => {
    const seed = seedWith({ askedQuestions: ['spark.idea', 'taste.comps'], constraints: [constraint('setting', 'a drowned cathedral city', 'shape')] });
    expect(nextQuestions(seed).questions.map(question => question.id)).toContain('orient.room');
  });

  it('should be asked to a seed that only has a premise', () => {
    const seed = seedWith({ askedQuestions: ['spark.idea', 'taste.comps'], fields: { premise: 'a tide-priest sells prophecies she no longer believes' } });
    expect(nextQuestions(seed).questions.map(question => question.id)).toContain('orient.room');
  });
});

describe('recordOffered', () => {
  it('should repeat a forced question forever when only answered ids are recorded', () => {
    const seed = orientedSeed({ constraints: [constraint('cast', 'dual leads, bonded')] });
    const offers = [nextQuestions(seed), nextQuestions(seed), nextQuestions(seed)];
    expect(offers.every(offer => offer.questions.map(question => question.id).includes('deepen.secondLadder'))).toBe(true);
  });

  it('should break the repeat by recording every offered id', () => {
    const seed = orientedSeed({ constraints: [constraint('cast', 'dual leads, bonded')] });
    const first = nextQuestions(seed);
    const asked = recordOffered(seed, first);

    const second = nextQuestions({ ...seed, askedQuestions: asked });
    expect(asked).toEqual(expect.arrayContaining(first.questions.map(question => question.id)));
    expect(second.questions.map(question => question.id)).not.toContain('deepen.secondLadder');
    expect(second.forced).not.toContain('deepen.secondLadder');
  });

  it('should record an offer without duplicating an id already asked', () => {
    const seed = seedWith({ askedQuestions: ['spark.idea'] });
    const twice = recordOffered({ ...seed, askedQuestions: recordOffered(seed, nextQuestions(seed)) }, nextQuestions(seed));
    expect(new Set(twice).size).toBe(twice.length);
  });
});

describe('interview termination', () => {
  const MAX_TURNS = 40;

  const DUMMY: Record<string, string | string[]> = { themes: ['settled'] };

  const walk = (start: RouterSeedState): { turns: number; offered: string[]; done: boolean; dead: boolean } => {
    const seed: RouterSeedState = { ...start, fields: { ...start.fields }, askedQuestions: [...start.askedQuestions] };
    const offered: string[] = [];
    let dead = false;

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const result = nextQuestions(seed);
      if (result.questions.length === 0) {
        if (!result.done) dead = true;
        return { turns: turn, offered, done: result.done, dead };
      }
      for (const question of result.questions) {
        offered.push(question.id);
        for (const field of question.fills) seed.fields[field] = (DUMMY[field] ?? 'settled') as never;
      }
      seed.askedQuestions = recordOffered(seed, result);
    }
    return { turns: MAX_TURNS, offered, done: nextQuestions(seed).done, dead: true };
  };

  const KITCHEN_SINK = (): RouterSeedState =>
    seedWith({
      constraints: [
        constraint('shelf', 'a litRPG with a visible status window'),
        constraint('cast', 'dual leads, bonded by the debt'),
        constraint('length', 'open ended, an ongoing web serial', 'scope'),
        constraint('regression', 'she returns to the day before the siege'),
        constraint('romance', 'no harem, one romance only', 'promise'),
        constraint('pacing', 'a slow burn, deferred for years'),
        constraint('setting', 'a drowned cathedral city', 'scope'),
        constraint('epistolary', 'told through salvage manifests'),
      ],
    });

  it.each([
    ['blank', blankSeed],
    ['premise-only', () => seedWith({ fields: { premise: 'a tide-priest sells prophecies she no longer believes' } })],
    ['litrpg-locked', () => seedWith({ constraints: [constraint('shelf', 'a litRPG with a visible status window')] })],
    ['dual-leads-locked', () => seedWith({ constraints: [constraint('cast', 'dual leads, bonded by the debt')] })],
    ['single-pov-locked', () => seedWith({ constraints: [constraint('pov', 'single pov, tight third throughout')] })],
    ['ensemble-locked', () => seedWith({ constraints: [constraint('cast', 'an ensemble, a crew of five')] })],
    ['spark-rich', SPARK_RICH],
    ['kitchen-sink', KITCHEN_SINK],
  ])('should walk a %s seed to a finished sheet without ever dead-ending', (_name, build) => {
    const result = walk(build());
    expect(result.dead).toBe(false);
    expect(result.done).toBe(true);
    expect(result.turns).toBeLessThanOrEqual(MAX_TURNS);
    expect(new Set(result.offered).size).toBe(result.offered.length);
  });

  it('should reach a finished sheet for an author who answers only the first question of every turn', () => {
    const seed = blankSeed();
    let turns = 0;
    for (; turns < MAX_TURNS; turns++) {
      const result = nextQuestions(seed);
      if (result.done) break;
      expect(result.questions.length).toBeGreaterThan(0);
      const first = result.questions[0]!;
      for (const field of first.fills) seed.fields[field] = (DUMMY[field] ?? 'settled') as never;
      seed.askedQuestions = recordOffered(seed, result);
    }
    expect(nextQuestions(seed).done).toBe(true);
    expect(turns).toBeLessThan(MAX_TURNS);
  });

  it('should keep offering questions to an author who answers nothing at all', () => {
    const seed = blankSeed();
    for (let turn = 0; turn < 30; turn++) {
      const result = nextQuestions(seed);
      expect(result.done).toBe(false);
      expect(result.questions.length).toBeGreaterThan(0);
      seed.askedQuestions = recordOffered(seed, result);
    }
  });

  it('should re-offer a filler for every stress-ready field cleared back to null after the sheet was finished', () => {
    const finished: RouterSeedState = { ...blankSeed(), askedQuestions: QUESTION_BANK.map(question => question.id) };
    for (const field of STRESS_READY_FIELDS) finished.fields[field] = (DUMMY[field] ?? 'settled') as never;
    expect(nextQuestions(finished).done).toBe(true);

    for (const cleared of STRESS_READY_FIELDS) {
      const seed: RouterSeedState = { ...finished, fields: { ...finished.fields, [cleared]: null } as Ideation.SeedFields };
      const result = nextQuestions(seed);
      expect(result.done).toBe(false);
      expect(result.questions.some(question => question.fills.includes(cleared))).toBe(true);
      expect(result.backfilled).toEqual(result.questions.map(question => question.id));
    }
  });

  const PLAYBOOK_CONSTRAINTS: Ideation.SeedConstraint[] = [
    constraint('cast', 'dual leads, bonded by the debt'),
    constraint('regression', 'she returns to the day before the siege'),
    constraint('romance', 'no harem, one romance only', 'promise'),
    constraint('shelf', 'a litRPG with a visible status window'),
    constraint('length', 'open ended, an ongoing web serial', 'scope'),
    constraint('cast', 'an ensemble, a crew of five'),
    constraint('pacing', 'a slow burn, deferred for years'),
    constraint('pov', 'single pov, tight third throughout'),
  ];

  const subsets = <T>(items: T[], mask: number): T[] => items.filter((_item, index) => (mask & (1 << index)) !== 0);

  /**
   * The invariant pin, over every playbook subset × every missing-field subset with the worst-case
   * `askedQuestions`. Two things must hold in each of the 65 536 states: the router never returns the
   * dead end `questions: [] && done: false`, and every missing field still has a filler the ordinary
   * stage walk can reach. Dropping a field from its sole filler's `fills` breaks the first; suppressing
   * a sole filler with `skipWhen` breaks the second, which the backfill would otherwise paper over.
   */
  it('should never dead-end or suppress a sole filler on any playbook and missing-field combination', () => {
    const askedQuestions = QUESTION_BANK.map(question => question.id);
    const dead: string[] = [];
    const suppressed: string[] = [];
    let states = 0;

    for (let playbookMask = 0; playbookMask < 1 << PLAYBOOK_CONSTRAINTS.length; playbookMask++) {
      const constraints = subsets(PLAYBOOK_CONSTRAINTS, playbookMask);
      for (let fieldMask = 0; fieldMask < 1 << STRESS_READY_FIELDS.length; fieldMask++) {
        const missing = subsets(STRESS_READY_FIELDS, fieldMask);
        const fields = Object.fromEntries(STRESS_READY_FIELDS.filter(field => !missing.includes(field)).map(field => [field, DUMMY[field] ?? 'settled'])) as Ideation.SeedFields;
        const seed = seedWith({ constraints, fields, askedQuestions });
        const result = nextQuestions(seed);
        states++;

        if (result.questions.length === 0 && !result.done) dead.push(`${playbookMask}:${fieldMask} missing=${missing.join(',')}`);
        for (const field of missing) {
          if (!QUESTION_BANK.some(question => question.fills.includes(field) && !question.skipWhen(seed))) suppressed.push(`${playbookMask}:${fieldMask} ${field}`);
        }
      }
    }

    expect(states).toBe(65536);
    expect(dead).toEqual([]);
    expect(suppressed).toEqual([]);
  });

  it('should keep at least one filler in the bank for every stress-ready field', () => {
    const unfilled = STRESS_READY_FIELDS.filter(field => !QUESTION_BANK.some(question => question.fills.includes(field)));
    expect(unfilled).toEqual([]);
  });
});
