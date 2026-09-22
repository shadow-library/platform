import { describe, expect, it } from 'bun:test';

import { loadWriterHiddenFactKeys } from '@modules/bible/fact/knowledge-view';
import { type MaterialiseContext } from '@modules/blueprint/engine/blueprint-step.types';
import { type WorldSliceOptions } from '@modules/blueprint/steps/engine.step';
import { COST_RULE_KEY, OPEN_FROM_CHAPTER, type WorldSelection, worldStep } from '@modules/blueprint/steps/world.step';
import { type Ledger } from '@server/database';

import { ledgerEntry, pageTx } from './blueprint-fixtures';

const view: WorldSliceOptions = {
  summary: 'A coast that pays for its light',
  costRules: [
    { id: 'cr1', rule: 'Every lit hour costs a named memory', why: 'It makes power personal', writerLine: 'Name the memory the lamp spends' },
    { id: 'cr2', rule: 'Every lit hour costs a year of sight', why: 'It makes power visible', writerLine: 'Show the dimming eyes' },
  ],
  rules: [
    { id: 'wr1', rule: 'A lamp lit without a paid memory burns the keeper', why: 'Keeps the cost from being skipped' },
    { id: 'wr2', rule: 'Only a licensed keeper may open a memory jar', why: 'Gives the office its grip' },
  ],
  honoured: ['Lifespan cost'],
};

function selection(overrides: Partial<WorldSelection> = {}): WorldSelection {
  return {
    summary: 'A coast that pays for its light',
    cost: { optionId: 'cr1', rule: 'Every lit hour costs a named memory', why: 'It makes power personal', writerLine: 'Name the memory the lamp spends' },
    rules: [
      { optionId: 'wr1', rule: 'A lamp lit without a paid memory burns the keeper', why: 'Keeps the cost from being skipped' },
      { optionId: 'wr2', rule: 'Only a licensed keeper may open a memory jar' },
    ],
    writerLine: 'Every use of the lamp names what it spent.',
    ...overrides,
  };
}

function materialise(chosen: WorldSelection, ledger: Ledger.Entry[] = [], page: string | null = null) {
  const context = { round: { round: 1, options: view }, ledger, project: { id: 7n }, tx: pageTx(page) } as unknown as MaterialiseContext<WorldSliceOptions | null>;
  return worldStep.materialise(chosen, context);
}

const locked = (entityKeys: string[], factKeys: string[]): Ledger.Entry =>
  ledgerEntry({ kind: 'decision', phase: 'world', topic: 'world.rules', stepKey: 'world', links: { entityKeys, factKeys } });

const bodyOf = (plan: Awaited<ReturnType<typeof materialise>>, slug: string): string =>
  (plan.changeSet?.find(op => op.op === 'bible_document.upsert' && op.slug === slug) as { body: string }).body;

describe('worldStep.materialise', () => {
  it('should write the cost rule and the rules as two decisions on their own topics', async () => {
    const plan = await materialise(selection());

    expect(plan.entries.map(entry => entry.topic)).toEqual(['world.cost', 'world.rules']);
    expect(plan.entries[0]).toMatchObject({
      statement: 'Every lit hour costs a named memory',
      writerLine: 'Name the memory the lamp spends',
      rejectedAlternatives: ['Every lit hour costs a year of sight'],
      links: { entityKeys: [COST_RULE_KEY], factKeys: [COST_RULE_KEY] },
    });
    expect(plan.entries[1]).toMatchObject({ statement: 'A coast that pays for its light', writerLine: 'Every use of the lamp names what it spent.' });
    expect(plan.entries[1]?.payload).toMatchObject({ honoured: ['Lifespan cost'] });
  });

  it('should make every hard rule a canon fact open from chapter one, never a scheduled secret', async () => {
    const plan = await materialise(selection());
    const facts = plan.changeSet?.filter(op => op.op === 'fact.upsert') ?? [];

    expect(facts).toHaveLength(3);
    expect(facts).toContainEqual({
      op: 'fact.upsert',
      factKey: 'world_rule_a_lamp_lit_without_a_paid',
      body: 'A lamp lit without a paid memory burns the keeper',
      subjects: ['world_rule_a_lamp_lit_without_a_paid'],
      revealChapter: OPEN_FROM_CHAPTER,
      constraintNote: 'Keeps the cost from being skipped',
    });
    expect(facts).toContainEqual({
      op: 'fact.upsert',
      factKey: COST_RULE_KEY,
      body: 'Every lit hour costs a named memory',
      subjects: [COST_RULE_KEY],
      revealChapter: OPEN_FROM_CHAPTER,
      constraintNote: 'It makes power personal',
    });
    // A writer note and give-away terms belong to a fact being withheld; these are not withheld from anyone.
    expect(facts.every(fact => !('writerNote' in fact) && !('terms' in fact))).toBe(true);
  });

  it('should leave every one of those facts readable by whoever writes chapter one', async () => {
    const plan = await materialise(selection());
    const rows = (plan.changeSet?.filter(op => op.op === 'fact.upsert') ?? []).map((fact, index) => ({
      id: BigInt(index + 1),
      factKey: fact.factKey,
      text: fact.body ?? '',
      revealChapter: fact.revealChapter ?? null,
      constraintNote: fact.constraintNote ?? null,
      writerNote: null,
      terms: null,
      source: 'manual' as const,
    }));
    const db = { query: { briefs: { findFirst: async () => undefined }, characterKnowledge: { findMany: async () => [] } } };

    const hidden = await loadWriterHiddenFactKeys(db as never, 7n, 1, rows as never);
    expect([...hidden]).toEqual([]);
  });

  it('should drop the coach’s honoured refusals once the author has rewritten the rules they were about', async () => {
    const kept = await materialise(selection());
    expect(kept.entries[1]?.payload).toMatchObject({ honoured: ['Lifespan cost'] });

    const rewritten = await materialise(selection({ rules: [{ optionId: 'wr1', rule: 'A lamp lit unpaid burns the whole street' }] }));
    expect(rewritten.entries[1]?.payload).not.toHaveProperty('honoured');

    const added = await materialise(selection({ rules: [...selection().rules, { rule: 'Jars may not be opened at sea' }] }));
    expect(added.entries[1]?.payload).not.toHaveProperty('honoured');
  });

  it('should record every rule as a concept so the Story Bible reads it, and the cost as a power rule', async () => {
    const plan = await materialise(selection());
    const entities = plan.changeSet?.filter(op => op.op === 'entity.upsert') ?? [];

    expect(entities.map(entity => entity.type)).toEqual(['power_rule', 'concept', 'concept']);
    expect(entities[0]).toMatchObject({ entityKey: COST_RULE_KEY, name: 'The cost of power' });
  });

  it('should merge the cost of power into the page the ladder shares, keeping the ladder', async () => {
    const plan = await materialise(selection(), [], '# Power and its cost\n\n## The ladder\n\n| Rank |\n| --- |\n| Taper |');

    expect(bodyOf(plan, 'system-and-limits')).toContain('## The ladder');
    expect(bodyOf(plan, 'system-and-limits')).toContain('## The cost of power');
    expect(bodyOf(plan, 'system-and-limits')).toContain('**Means for the writer:** Name the memory the lamp spends');
  });

  it('should write society and economy instead of a ladder when the novel was asked for them', async () => {
    const plan = await materialise(selection({ society: { order: 'The Lamp Office licenses every keeper.', economy: 'Memory jars are the coin of the coast.' } }));

    expect(bodyOf(plan, 'setting-overview')).toContain('## Society and economy');
    expect(bodyOf(plan, 'setting-overview')).toContain('Memory jars are the coin of the coast.');
    expect(plan.entries[1]?.payload).toMatchObject({ society: { order: 'The Lamp Office licenses every keeper.', economy: 'Memory jars are the coin of the coast.' } });
  });

  it('should leave the society section out when the novel has a ladder instead', async () => {
    const plan = await materialise(selection(), [], '# The world\n\n## Society and economy\n\nstale');
    expect(bodyOf(plan, 'setting-overview')).not.toContain('## Society and economy');
  });

  it('should re-lock the same rules without removing or duplicating their facts', async () => {
    const first = await materialise(selection());
    const links = first.entries[1]?.links ?? {};
    const second = await materialise(selection(), [locked(links.entityKeys ?? [], links.factKeys ?? [])]);

    expect(second.changeSet?.some(op => op.op === 'fact.remove' || op.op === 'entity.remove')).toBe(false);
    expect(second.changeSet).toEqual(first.changeSet!);
  });

  it('should retire the fact of a rule the author dropped', async () => {
    const plan = await materialise(selection({ rules: [{ rule: 'Only a licensed keeper may open a memory jar' }] }), [
      locked(['world_rule_a_lamp_lit_without_a_paid'], ['world_rule_a_lamp_lit_without_a_paid']),
    ]);

    expect(plan.changeSet).toContainEqual({ op: 'fact.remove', factKey: 'world_rule_a_lamp_lit_without_a_paid' });
    expect(plan.changeSet).toContainEqual({ op: 'entity.remove', entityKey: 'world_rule_a_lamp_lit_without_a_paid' });
  });

  it('should refuse an empty cost rule, an empty summary and a missing writer line', async () => {
    await expect(materialise(selection({ cost: { rule: '  ', writerLine: 'x' } }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ summary: ' ' }))).rejects.toMatchObject({ code: 'BPR_004' });
    await expect(materialise(selection({ writerLine: ' ' }))).rejects.toMatchObject({ code: 'BPR_004' });
  });
});

describe('worldStep', () => {
  it('should offer the cost rules and the rules as its options, and is asked of every novel', () => {
    expect(worldStep.describeView(view).map(option => option.id)).toEqual(['cr1', 'cr2', 'wr1', 'wr2']);
    expect(worldStep.chosenOptionIds(selection())).toEqual(['cr1', 'wr1', 'wr2']);
    expect(worldStep.appliesWhen).toBeUndefined();
  });
});
