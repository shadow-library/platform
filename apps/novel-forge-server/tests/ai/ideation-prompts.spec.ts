import { describe, expect, it } from 'bun:test';

import {
  buildIdeationStressPrompt,
  buildIdeationTurnPrompt,
  CONCEPT_CARD_COUNT,
  IDEATION_EDITORIAL_CHARTER,
  PROMPT_REGISTRY,
  renderReadinessPrecheck,
  renderScopeInstructions,
  SCOPE_PLAYBOOKS,
} from '@modules/ai/prompts';
import { IdeationConceptsSchema, IdeationStressSchema, IdeationTurnSchema } from '@modules/ai/schemas';
import { parseSchema } from '@modules/ai/schemas/validate';
import { getQuestion } from '@modules/ideation/question-bank';
import { READINESS_DIMENSION_ORDER, type ReadinessDimension } from '@modules/ideation/question-router';

const question = {
  id: 'deepen.engine',
  wording: 'What keeps the salvage runs dangerous once he owns a ship?',
  coaching: 'Coaching line, verbatim.',
  options: ['Debt', 'A rival crew'],
  youDecide: 'Debt — it renews every arc.',
};

const roundOf = (...questions: { id: string; coaching: string }[]) => ({ questions: questions as never });

const card = (index: number) => ({
  title: `Card ${index}`,
  logline: 'A salvager takes one job too many.',
  engine: `engine ${index}`,
  ladder: `ladder ${index}`,
  posture: `posture ${index}`,
  hookLine: 'The derelict was still warm.',
});

const cards = (count = CONCEPT_CARD_COUNT) => Array.from({ length: count }, (_, index) => card(index + 1));

const conceptsOut = (count = CONCEPT_CARD_COUNT) => ({ kind: 'cards', cards: cards(count) });

const readiness = (overrides: Partial<Record<string, string>> = {}) =>
  READINESS_DIMENSION_ORDER.map(dimension => ({ dimension, verdict: overrides[dimension] ?? 'thin', note: 'the sheet says little here', fix: 'name the thing in one sentence' }));

const stressOut = (overrides: Partial<Record<string, string>> = {}) => ({ kind: 'readiness', readiness: readiness(overrides) });

const precheck = (verdicts: Partial<Record<string, ReadinessDimension['verdict']>>): ReadinessDimension[] =>
  READINESS_DIMENSION_ORDER.map(dimension => ({ dimension, fields: [], present: [], verdict: verdicts[dimension] ?? 'strong' }));

describe('ideation prompt modules', () => {
  it('should register the three studio prompts on the chat and judge roles', () => {
    expect(PROMPT_REGISTRY['ideation-turn'].role).toBe('chat');
    expect(PROMPT_REGISTRY['ideation-concepts'].role).toBe('chat');
    expect(PROMPT_REGISTRY['ideation-stress'].role).toBe('judge');

    expect(PROMPT_REGISTRY['ideation-turn'].kind).toBe('authoring');
    expect(PROMPT_REGISTRY['ideation-concepts'].kind).toBe('authoring');
    expect(PROMPT_REGISTRY['ideation-stress'].kind).toBe('analytical');

    expect(PROMPT_REGISTRY['ideation-turn'].version).toBe('1.1.0');
    for (const key of ['ideation-concepts', 'ideation-stress'] as const) expect(PROMPT_REGISTRY[key].version).toBe('1.0.0');
    for (const key of ['ideation-turn', 'ideation-concepts', 'ideation-stress'] as const) {
      expect(PROMPT_REGISTRY[key].cacheStrategy).toEqual({ stableVars: ['stableContext'] });
    }
  });

  it('should render ideation-turn in cache order: system, stable sheet, history, the round and the author', async () => {
    const messages = await PROMPT_REGISTRY['ideation-turn'].template.formatMessages({
      stableContext: 'STABLE-SEED-SHEET',
      history: [],
      volatileContext: 'VOLATILE-ROUND',
      userMessage: 'dual leads, both salvagers',
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]?.getType()).toBe('system');
    expect(String(messages[1]?.content)).toBe('STABLE-SEED-SHEET');
    expect(String(messages[2]?.content)).toContain('VOLATILE-ROUND');
    expect(String(messages[2]?.content)).toContain('dual leads, both salvagers');
  });

  it('should tell the turn prompt it may neither invent questions nor rewrite a coaching line', () => {
    const system = PROMPT_REGISTRY['ideation-turn'].system;
    expect(system).toContain('character for character');
    expect(system).toContain('never invent a question of your own');
    expect(system).toContain('CIRCLING BACK');
    expect(system).toContain('HINT');
  });

  it('should carry the emission contracts the router reads back', () => {
    const system = PROMPT_REGISTRY['ideation-turn'].system;
    expect(system).toContain('A question that lists NO fields never produces a field');
    expect(system).toContain("when the question's intent names a key and a kind, use exactly those");
    expect(system).toContain('otherwise choose a short kebab-case key and the kind the intent implies');
    expect(system).toContain('The spark question is the one exception');
  });

  it('should state the wholesale-replace rule once, in the rendered op vocabulary', () => {
    const system = PROMPT_REGISTRY['ideation-turn'].system;
    expect(system).toContain('"constraints", "concepts", and "tasteAnchors" replace their whole column');
    expect(system).not.toContain('"constraints" replaces the whole list');
  });

  it("should name tasteAnchors as the taste question's destination, in the prompt and in the question itself", () => {
    expect(PROMPT_REGISTRY['ideation-turn'].system).toContain('Its answer writes seed.update tasteAnchors');
    expect(getQuestion('taste.comps')?.intent).toContain('emit it as seed.update tasteAnchors');
  });

  it('should keep the reply a lead-in and the questions in payload.questions[].wording', () => {
    const system = PROMPT_REGISTRY['ideation-turn'].system;
    expect(system).toContain('"reply" is the lead-in and nothing more');
    expect(system).toContain('payload.questions[].wording');
    expect(system).toContain('A question repeated in the reply is the author asked twice');
  });

  it('should split locks from the change set by where the decision came from', () => {
    const system = PROMPT_REGISTRY['ideation-turn'].system;
    expect(system).toContain('goes straight into the changeSet');
    expect(system).toContain('payload.locks is for inferred material only');
  });

  it('should name a constraint key and kind on every playbook-gated question', () => {
    const gated = ['deepen.secondLadder', 'deepen.foreknowledgeDecay', 'deepen.divergence', 'deepen.stayingCost'] as const;
    const gatedKeys = { 'deepen.secondLadder': 'ladder', 'deepen.foreknowledgeDecay': 'knowledge', 'deepen.divergence': 'divergence', 'deepen.stayingCost': 'tension' };
    const more = { 'deepen.systemRules': 'system', 'deepen.povBudget': 'pov', 'deepen.deferredTension': 'tension', 'deepen.ironyBudget': 'irony' };

    for (const [id, key] of [...gated.map(id => [id, gatedKeys[id]] as const), ...Object.entries(more)]) {
      expect(getQuestion(id)?.intent).toContain(`key '${key}' and kind 'shape'`);
    }
  });

  it('should exempt the spark question from a fixed emission key', () => {
    const intent = getQuestion('spark.idea')?.intent ?? '';
    expect(intent).toContain('no fixed emission key');
    expect(intent).toContain('sheet-shaped material lands as fields in seed.update');
    expect(intent).toContain('story-rule material as constraints');
    expect(intent).toContain('offered as locks for confirmation first');
  });

  it('should render ideation-concepts with the stable sheet first and the round material last', async () => {
    const messages = await PROMPT_REGISTRY['ideation-concepts'].template.formatMessages({ stableContext: 'STABLE-SEED-SHEET', volatileContext: 'KILLED-CARDS' });

    expect(messages).toHaveLength(3);
    expect(String(messages[1]?.content)).toBe('STABLE-SEED-SHEET');
    expect(String(messages[2]?.content)).toBe('KILLED-CARDS');
    expect(PROMPT_REGISTRY['ideation-concepts'].system).toContain('never resurrect it under a new title');
  });

  it('should render ideation-stress with the deterministic precheck in the volatile tail', async () => {
    const messages = await PROMPT_REGISTRY['ideation-stress'].template.formatMessages({ stableContext: 'STABLE-SEED-SHEET', precheck: 'hook: empty (no fields present)' });

    expect(messages).toHaveLength(3);
    expect(String(messages[1]?.content)).toBe('STABLE-SEED-SHEET');
    expect(String(messages[2]?.content)).toContain('hook: empty (no fields present)');
    for (const dimension of READINESS_DIMENSION_ORDER) expect(PROMPT_REGISTRY['ideation-stress'].system).toContain(`- ${dimension}:`);
    expect(PROMPT_REGISTRY['ideation-stress'].system).toContain('advises and never blocks');
  });
});

describe('the ideation scope playbook', () => {
  it('should carry the four product rules of the studio charter', () => {
    const guidance = SCOPE_PLAYBOOKS.ideation.guidance;
    expect(guidance).toContain('Never an empty box');
    expect(guidance).toContain("'You decide' commits and explains");
    expect(guidance).toContain('Never ask what you were already told');
    expect(guidance).toContain('The exit is always visible');
  });

  it('should render the sheet edit and the exit, and no other vocabulary', () => {
    const instructions = renderScopeInstructions('ideation');
    expect(instructions).toContain('"op": "seed.update"');
    expect(instructions).toContain('the merge is per key');
    expect(instructions).toContain('"op": "action.graduate_seed"');
    expect(instructions).not.toContain('"op": "premise.update"');
    expect(instructions).not.toContain('"op": "bible_document.upsert"');
    expect(instructions).not.toContain('"op": "action.plan_volumes"');
  });

  it('should let the studio stage sheet edits and the graduation, and nothing else', () => {
    expect(SCOPE_PLAYBOOKS.ideation.allowedOps).toEqual(['seed.update']);
    expect(SCOPE_PLAYBOOKS.ideation.allowedActions).toEqual(['action.graduate_seed']);
  });

  it('should bake the charter and the vocabulary into the turn prompt itself', () => {
    expect(PROMPT_REGISTRY['ideation-turn'].system).toContain(SCOPE_PLAYBOOKS.ideation.guidance);
    expect(PROMPT_REGISTRY['ideation-turn'].system).toContain('"op": "seed.update"');
  });

  it('should give the concept round the charter without the interview mechanics', () => {
    const system = PROMPT_REGISTRY['ideation-concepts'].system;
    expect(system).toContain(IDEATION_EDITORIAL_CHARTER);
    expect(system).toContain('A locked constraint is a promise, not a preference');
    expect(system).not.toContain('a question router picks what gets asked');
    expect(system).not.toContain('you never rewrite a coaching line');
    expect(system).not.toContain('Never an empty box');
  });
});

describe('IdeationTurnSchema', () => {
  const valid = { reply: 'Heard you.', payload: { kind: 'questions', questions: [question] } };

  it('should accept a turn that asks questions and settles nothing', () => {
    expect(parseSchema(IdeationTurnSchema, valid).success).toBe(true);
  });

  it('should accept locks and a seed.update change set', () => {
    const withOps = {
      ...valid,
      payload: { kind: 'questions', questions: [question], locks: [{ key: 'promise', kind: 'promise', text: 'no harem' }] },
      changeSet: [{ op: 'seed.update', fields: { genre: 'progression fantasy' } }],
    };
    expect(parseSchema(IdeationTurnSchema, withOps).success).toBe(true);
  });

  it('should accept an empty question list, which is how a finished sheet reports itself', () => {
    expect(parseSchema(IdeationTurnSchema, { reply: 'You are ready.', payload: { kind: 'questions', questions: [] } }).success).toBe(true);
  });

  it('should reject a payload without its envelope tag', () => {
    expect(parseSchema(IdeationTurnSchema, { reply: 'Heard you.', payload: { questions: [question] } }).success).toBe(false);
    expect(parseSchema(IdeationTurnSchema, { reply: 'Heard you.', payload: { kind: 'cards', questions: [question] } }).success).toBe(false);
  });

  it('should reject a question offering fewer than two options — a turn never ends in an empty box', () => {
    const oneOption = { ...valid, payload: { kind: 'questions', questions: [{ ...question, options: ['Debt'] }] } };
    expect(parseSchema(IdeationTurnSchema, oneOption).success).toBe(false);
  });

  it('should reject a question missing its coaching line or its escape hatch', () => {
    for (const field of ['id', 'wording', 'coaching', 'options', 'youDecide'] as const) {
      const { [field]: _dropped, ...rest } = question;
      expect(parseSchema(IdeationTurnSchema, { ...valid, payload: { kind: 'questions', questions: [rest] } }).success).toBe(false);
    }
  });

  it('should reject a lock filed under an unknown kind', () => {
    const badKind = { ...valid, payload: { kind: 'questions', questions: [question], locks: [{ key: 'promise', kind: 'vibe', text: 'no harem' }] } };
    expect(parseSchema(IdeationTurnSchema, badKind).success).toBe(false);
  });

  it('should reject a payload the studio never asked for', () => {
    expect(parseSchema(IdeationTurnSchema, { ...valid, readiness: [] }).success).toBe(false);
  });

  it('should reject ops outside the seed vocabulary and pass a bare conversational turn', () => {
    const postValidate = PROMPT_REGISTRY['ideation-turn'].postValidate;
    expect(postValidate?.({ ...valid, changeSet: [{ op: 'premise.update', premise: 'x' }] } as never)[0]).toMatch(/not allowed for this scope/);
    expect(postValidate?.({ ...valid, changeSet: [{ op: 'seed.update', fields: { hook: 'a warm derelict' } }] } as never)).toEqual([]);
    expect(postValidate?.(valid as never)).toEqual([]);
    expect(postValidate?.({ ...valid, changeSet: [] } as never)).toEqual([]);
  });
});

describe('buildIdeationTurnPrompt', () => {
  const second = { ...question, id: 'deepen.voice', coaching: 'Second coaching line, verbatim.' };
  const round = roundOf(question, second);
  const turn = (...questions: unknown[]) => ({ reply: 'Heard you.', payload: { kind: 'questions', questions } });

  it('should pass a turn that echoes the round exactly', () => {
    expect(buildIdeationTurnPrompt(round).postValidate?.(turn(question, second) as never)).toEqual([]);
  });

  it('should reject a paraphrased coaching line', () => {
    const paraphrased = { ...question, coaching: 'Coaching line, verbatim' };
    expect(buildIdeationTurnPrompt(round).postValidate?.(turn(paraphrased, second) as never)[0]).toMatch(/coaching line for 'deepen.engine' was rewritten/);
  });

  it('should reject a dropped question', () => {
    expect(buildIdeationTurnPrompt(round).postValidate?.(turn(question) as never)[0]).toMatch(/'deepen.voice' was in this round and is missing/);
  });

  it('should reject an invented id', () => {
    const invented = { ...question, id: 'deepen.madeUp' };
    const errors = buildIdeationTurnPrompt(round).postValidate?.(turn(invented, second) as never) ?? [];
    expect(errors[0]).toMatch(/'deepen.madeUp' is not one of this round's questions/);
    expect(errors[1]).toMatch(/'deepen.engine' was in this round and is missing/);
  });

  it('should reject the same question answered twice', () => {
    expect(buildIdeationTurnPrompt(round).postValidate?.(turn(question, question, second) as never)[0]).toMatch(/'deepen.engine' appears 2 times/);
  });

  it('should still enforce the seed vocabulary alongside the round echo', () => {
    const data = { ...turn(question, second), changeSet: [{ op: 'premise.update', premise: 'x' }] };
    expect(buildIdeationTurnPrompt(round).postValidate?.(data as never)[0]).toMatch(/not allowed for this scope/);
  });
});

describe('IdeationConceptsSchema', () => {
  it('should accept exactly four distinct cards', () => {
    const parsed = parseSchema(IdeationConceptsSchema, conceptsOut());
    expect(parsed.success).toBe(true);
    expect(PROMPT_REGISTRY['ideation-concepts'].postValidate?.(conceptsOut() as never)).toEqual([]);
  });

  it('should reject any card count other than four, through the schema', () => {
    for (const count of [0, 3, 5]) expect(parseSchema(IdeationConceptsSchema, conceptsOut(count)).success).toBe(false);
  });

  it('should reject an output without its envelope tag', () => {
    expect(parseSchema(IdeationConceptsSchema, { cards: cards() }).success).toBe(false);
    expect(parseSchema(IdeationConceptsSchema, { kind: 'questions', cards: cards() }).success).toBe(false);
  });

  it('should reject a card missing an axis', () => {
    const [first = card(1), ...rest] = cards();
    const { engine: _engine, ...noEngine } = first;
    expect(parseSchema(IdeationConceptsSchema, { kind: 'cards', cards: [noEngine, ...rest] }).success).toBe(false);
  });

  it('should reject two cards that share an axis, case and padding ignored', () => {
    const shared = cards();
    shared[1] = { ...card(2), posture: '  POSTURE 1 ' };
    const errors = PROMPT_REGISTRY['ideation-concepts'].postValidate?.({ kind: 'cards', cards: shared } as never) ?? [];
    expect(errors[0]).toMatch(/share the same posture/);
  });

  it('should name every axis two identical cards share', () => {
    const twins = cards();
    twins[3] = { ...card(1), title: 'Card 4' };
    const errors = PROMPT_REGISTRY['ideation-concepts'].postValidate?.({ kind: 'cards', cards: twins } as never) ?? [];
    expect(errors[0]).toMatch(/engine and ladder and posture/);
  });
});

describe('IdeationStressSchema', () => {
  it('should accept the seven dimensions in the router order', () => {
    const parsed = parseSchema(IdeationStressSchema, stressOut());
    expect(parsed.success).toBe(true);
    expect(PROMPT_REGISTRY['ideation-stress'].postValidate?.(stressOut() as never)).toEqual([]);
  });

  it('should reject a report that skips a dimension, through the schema', () => {
    expect(parseSchema(IdeationStressSchema, { kind: 'readiness', readiness: readiness().slice(1) }).success).toBe(false);
  });

  it('should reject an output without its envelope tag', () => {
    expect(parseSchema(IdeationStressSchema, { readiness: readiness() }).success).toBe(false);
    expect(parseSchema(IdeationStressSchema, { kind: 'cards', readiness: readiness() }).success).toBe(false);
  });

  it('should reject a dimension name outside the seven', () => {
    const invented = readiness().map((entry, index) => (index === 2 ? { ...entry, dimension: 'pacing' } : entry));
    expect(parseSchema(IdeationStressSchema, { kind: 'readiness', readiness: invented }).success).toBe(false);
  });

  it('should reject the seven dimensions reported out of order', () => {
    const shuffled = [...readiness()].reverse();
    expect(PROMPT_REGISTRY['ideation-stress'].postValidate?.({ kind: 'readiness', readiness: shuffled } as never)[0]).toMatch(/must be the 'hook' dimension/);
  });

  it('should require a fix on every thin and empty verdict', () => {
    const noFix = readiness().map(entry => ({ dimension: entry.dimension, verdict: entry.verdict, note: entry.note }));
    const errors = PROMPT_REGISTRY['ideation-stress'].postValidate?.({ kind: 'readiness', readiness: noFix } as never) ?? [];
    expect(errors).toHaveLength(READINESS_DIMENSION_ORDER.length);
    expect(errors[0]).toMatch(/needs a concrete fix/);
  });

  it('should let a verdict upgrade a precheck that found material', () => {
    const prompt = buildIdeationStressPrompt(precheck({ hook: 'thin' }));
    expect(prompt.postValidate?.(stressOut({ hook: 'strong' }) as never)).toEqual([]);
  });

  it('should never let a structurally empty dimension be called strong', () => {
    const prompt = buildIdeationStressPrompt(precheck({ voice: 'empty' }));
    expect(prompt.postValidate?.(stressOut({ voice: 'strong' }) as never)[0]).toMatch(/'voice' dimension has no material/);
    expect(prompt.postValidate?.(stressOut({ voice: 'thin' }) as never)).toEqual([]);
  });

  it('should report shape errors before the contradiction rule', () => {
    const prompt = buildIdeationStressPrompt(precheck({ hook: 'empty' }));
    const shuffled = { kind: 'readiness', readiness: [...readiness({ hook: 'strong' })].reverse() };
    expect(prompt.postValidate?.(shuffled as never)[0]).toMatch(/must be the 'hook' dimension/);
  });
});

describe('renderReadinessPrecheck', () => {
  it('should name each dimension its verdict, what the sheet found, and what is still missing', () => {
    const rendered = renderReadinessPrecheck([
      { dimension: 'protagonist', fields: ['protagonistDrive', 'castShape'], present: ['castShape'], verdict: 'thin' },
      { dimension: 'voice', fields: ['voice'], present: [], verdict: 'empty' },
      { dimension: 'hook', fields: ['hook'], present: ['hook'], verdict: 'strong' },
    ]);

    expect(rendered.split('\n')).toEqual([
      'protagonist: thin — present: castShape — missing: protagonistDrive',
      'voice: empty — no fields present — missing: voice',
      'hook: strong — present: hook',
    ]);
  });
});
