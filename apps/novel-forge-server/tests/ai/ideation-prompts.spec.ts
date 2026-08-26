import { describe, expect, it } from 'bun:test';

import { buildIdeationStressPrompt, CONCEPT_CARD_COUNT, PROMPT_REGISTRY, renderScopeInstructions, SCOPE_PLAYBOOKS } from '@modules/ai/prompts';
import { IdeationConceptsSchema, IdeationStressSchema, IdeationTurnSchema } from '@modules/ai/schemas';
import { parseSchema } from '@modules/ai/schemas/validate';
import { READINESS_DIMENSION_ORDER, type ReadinessDimension } from '@modules/ideation/question-router';

const question = {
  id: 'deepen.engine',
  wording: 'What keeps the salvage runs dangerous once he owns a ship?',
  coaching: 'Coaching line, verbatim.',
  options: ['Debt', 'A rival crew'],
  youDecide: 'Debt — it renews every arc.',
};

const card = (index: number) => ({
  title: `Card ${index}`,
  logline: 'A salvager takes one job too many.',
  engine: `engine ${index}`,
  ladder: `ladder ${index}`,
  posture: `posture ${index}`,
  hookLine: 'The derelict was still warm.',
});

const cards = (count = CONCEPT_CARD_COUNT) => Array.from({ length: count }, (_, index) => card(index + 1));

const readiness = (overrides: Partial<Record<string, string>> = {}) =>
  READINESS_DIMENSION_ORDER.map(dimension => ({ dimension, verdict: overrides[dimension] ?? 'thin', note: 'the sheet says little here', fix: 'name the thing in one sentence' }));

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

    for (const key of ['ideation-turn', 'ideation-concepts', 'ideation-stress'] as const) {
      expect(PROMPT_REGISTRY[key].version).toBe('1.0.0');
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
    expect(system).toContain("the question's intent names the key and kind to use");
    expect(system).toContain('"constraints" replaces the whole list');
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

  it('should render the seed.update vocabulary and nothing else', () => {
    const instructions = renderScopeInstructions('ideation');
    expect(instructions).toContain('"op": "seed.update"');
    expect(instructions).toContain('the merge is per key');
    expect(instructions).not.toContain('"op": "premise.update"');
    expect(instructions).not.toContain('"op": "bible_document.upsert"');
    expect(instructions).not.toContain('action.');
  });

  // action.graduate_seed joins the playbook in T6, with the action op and its executor.
  it('should stage sheet edits only until the graduation action exists', () => {
    expect(SCOPE_PLAYBOOKS.ideation.allowedOps).toEqual(['seed.update']);
    expect(SCOPE_PLAYBOOKS.ideation.allowedActions).toBeUndefined();
  });

  it('should bake the charter and the vocabulary into the turn prompt itself', () => {
    expect(PROMPT_REGISTRY['ideation-turn'].system).toContain(SCOPE_PLAYBOOKS.ideation.guidance);
    expect(PROMPT_REGISTRY['ideation-turn'].system).toContain('"op": "seed.update"');
  });
});

describe('IdeationTurnSchema', () => {
  const valid = { reply: 'Heard you.', payload: { questions: [question] } };

  it('should accept a turn that asks questions and settles nothing', () => {
    expect(parseSchema(IdeationTurnSchema, valid).success).toBe(true);
  });

  it('should accept locks and a seed.update change set', () => {
    const withOps = {
      ...valid,
      payload: { questions: [question], locks: [{ key: 'promise', kind: 'promise', text: 'no harem' }] },
      changeSet: [{ op: 'seed.update', fields: { genre: 'progression fantasy' } }],
    };
    expect(parseSchema(IdeationTurnSchema, withOps).success).toBe(true);
  });

  it('should accept an empty question list, which is how a finished sheet reports itself', () => {
    expect(parseSchema(IdeationTurnSchema, { reply: 'You are ready.', payload: { questions: [] } }).success).toBe(true);
  });

  it('should reject a question offering fewer than two options — a turn never ends in an empty box', () => {
    const oneOption = { ...valid, payload: { questions: [{ ...question, options: ['Debt'] }] } };
    expect(parseSchema(IdeationTurnSchema, oneOption).success).toBe(false);
  });

  it('should reject a question missing its coaching line or its escape hatch', () => {
    for (const field of ['id', 'wording', 'coaching', 'options', 'youDecide'] as const) {
      const { [field]: _dropped, ...rest } = question;
      expect(parseSchema(IdeationTurnSchema, { ...valid, payload: { questions: [rest] } }).success).toBe(false);
    }
  });

  it('should reject a lock filed under an unknown kind', () => {
    const badKind = { ...valid, payload: { questions: [question], locks: [{ key: 'promise', kind: 'vibe', text: 'no harem' }] } };
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

describe('IdeationConceptsSchema', () => {
  it('should accept exactly four distinct cards', () => {
    const parsed = parseSchema(IdeationConceptsSchema, { cards: cards() });
    expect(parsed.success).toBe(true);
    expect(PROMPT_REGISTRY['ideation-concepts'].postValidate?.({ cards: cards() } as never)).toEqual([]);
  });

  it('should reject any card count other than four', () => {
    for (const count of [0, 3, 5]) expect(parseSchema(IdeationConceptsSchema, { cards: cards(count) }).success).toBe(false);
    expect(PROMPT_REGISTRY['ideation-concepts'].postValidate?.({ cards: cards(3) } as never)[0]).toMatch(/exactly 4 concept cards/);
  });

  it('should reject a card missing an axis', () => {
    const [first = card(1), ...rest] = cards();
    const { engine: _engine, ...noEngine } = first;
    expect(parseSchema(IdeationConceptsSchema, { cards: [noEngine, ...rest] }).success).toBe(false);
  });

  it('should reject two cards that share an axis, case and padding ignored', () => {
    const shared = cards();
    shared[1] = { ...card(2), posture: '  POSTURE 1 ' };
    const errors = PROMPT_REGISTRY['ideation-concepts'].postValidate?.({ cards: shared } as never) ?? [];
    expect(errors[0]).toMatch(/share the same posture/);
  });

  it('should name every axis two identical cards share', () => {
    const twins = cards();
    twins[3] = { ...card(1), title: 'Card 4' };
    const errors = PROMPT_REGISTRY['ideation-concepts'].postValidate?.({ cards: twins } as never) ?? [];
    expect(errors[0]).toMatch(/engine and ladder and posture/);
  });
});

describe('IdeationStressSchema', () => {
  it('should accept the seven dimensions in the router order', () => {
    const parsed = parseSchema(IdeationStressSchema, { readiness: readiness() });
    expect(parsed.success).toBe(true);
    expect(PROMPT_REGISTRY['ideation-stress'].postValidate?.({ readiness: readiness() } as never)).toEqual([]);
  });

  it('should reject a report that skips a dimension', () => {
    expect(parseSchema(IdeationStressSchema, { readiness: readiness().slice(1) }).success).toBe(false);
    expect(PROMPT_REGISTRY['ideation-stress'].postValidate?.({ readiness: readiness().slice(1) } as never)[0]).toMatch(/exactly 7 readiness entries/);
  });

  it('should reject a dimension name outside the seven', () => {
    const invented = readiness().map((entry, index) => (index === 2 ? { ...entry, dimension: 'pacing' } : entry));
    expect(parseSchema(IdeationStressSchema, { readiness: invented }).success).toBe(false);
  });

  it('should reject the seven dimensions reported out of order', () => {
    const shuffled = [...readiness()].reverse();
    expect(PROMPT_REGISTRY['ideation-stress'].postValidate?.({ readiness: shuffled } as never)[0]).toMatch(/must be the 'hook' dimension/);
  });

  it('should require a fix on every thin and empty verdict', () => {
    const noFix = readiness().map(entry => ({ dimension: entry.dimension, verdict: entry.verdict, note: entry.note }));
    const errors = PROMPT_REGISTRY['ideation-stress'].postValidate?.({ readiness: noFix } as never) ?? [];
    expect(errors).toHaveLength(READINESS_DIMENSION_ORDER.length);
    expect(errors[0]).toMatch(/needs a concrete fix/);
  });

  it('should let a verdict upgrade a precheck that found material', () => {
    const prompt = buildIdeationStressPrompt(precheck({ hook: 'thin' }));
    expect(prompt.postValidate?.({ readiness: readiness({ hook: 'strong' }) } as never)).toEqual([]);
  });

  it('should never let a structurally empty dimension be called strong', () => {
    const prompt = buildIdeationStressPrompt(precheck({ voice: 'empty' }));
    expect(prompt.postValidate?.({ readiness: readiness({ voice: 'strong' }) } as never)[0]).toMatch(/'voice' dimension has no material/);
    expect(prompt.postValidate?.({ readiness: readiness({ voice: 'thin' }) } as never)).toEqual([]);
  });

  it('should report shape errors before the contradiction rule', () => {
    const prompt = buildIdeationStressPrompt(precheck({ hook: 'empty' }));
    expect(prompt.postValidate?.({ readiness: readiness().slice(1) } as never)[0]).toMatch(/exactly 7 readiness entries/);
  });
});
