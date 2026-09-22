import { describe, expect, it } from 'bun:test';

import { loadKnowledgeView, loadWriterHiddenFactKeys, renderKnownFacts } from '@modules/bible/fact/knowledge-view';

const COST_RULE = 'Every lit hour costs a named memory.';

const facts = [
  { id: 1n, factKey: 'cost_of_power', text: COST_RULE, revealChapter: 1, constraintNote: 'It makes power personal', writerNote: null, terms: null, source: 'manual' as const },
  {
    id: 2n,
    factKey: 'world_rule_licensed_keeper',
    text: 'Only a licensed keeper may open a jar.',
    revealChapter: 1,
    constraintNote: null,
    writerNote: null,
    terms: null,
    source: 'manual' as const,
  },
  {
    id: 3n,
    factKey: 'reveal_1',
    text: 'The keeper paid with his own daughter’s name.',
    revealChapter: 8,
    constraintNote: null,
    writerNote: 'He avoids saying her name.',
    terms: ['daughter'],
    source: 'manual' as const,
  },
];

const contract = { pov: ['kaen'], learns: [{ entityKey: 'kaen', factKey: 'reveal_1' }] };

function db(chapterContract: unknown = contract) {
  return {
    query: {
      canonFacts: { findMany: async () => facts },
      entities: { findMany: async () => [{ id: 40n }] },
      characterKnowledge: { findMany: async () => [] },
      briefs: { findFirst: async () => ({ knowledgeContract: chapterContract, endingContract: null }) },
    },
  } as never;
}

describe('loadKnowledgeView under a chapter-one knowledge contract', () => {
  it('should carry the cost rule into the pack’s known facts even though the POV cast has ledgered nothing', async () => {
    const view = await loadKnowledgeView(db(), 7n, 1, contract);

    expect(view.known.map(fact => fact.factKey)).toEqual(['cost_of_power', 'world_rule_licensed_keeper']);
    expect(renderKnownFacts(view.known)).toContain(COST_RULE);
  });

  it('should still hold a scheduled secret back, and hand this chapter’s own reveal to the reveals section', async () => {
    const view = await loadKnowledgeView(db(), 7n, 1, contract);

    expect(view.reveals.map(fact => fact.factKey)).toEqual(['reveal_1']);
    expect(view.hidden).toEqual([]);

    const earlier = await loadKnowledgeView(db(), 7n, 1, { pov: ['kaen'], learns: [] });
    expect(earlier.hidden.map(fact => fact.factKey)).toEqual(['reveal_1']);
  });

  it('should not hand a POV cast a reveal that has already come out but that they were never in the room for', async () => {
    const view = await loadKnowledgeView(db(), 7n, 12, { pov: ['other'], learns: [] });

    expect(view.known.map(fact => fact.factKey)).toEqual(['cost_of_power', 'world_rule_licensed_keeper']);
    expect(view.hidden.map(fact => fact.factKey)).toEqual(['reveal_1']);
  });

  it('should still let whoever writes chapter 12 read a reveal that came out at chapter 8 when no contract bounds them', async () => {
    const hidden = await loadWriterHiddenFactKeys(db(null), 7n, 12, facts as never);
    expect([...hidden]).toEqual([]);
  });

  it('should leave the open rules readable by whoever writes chapter one, contract or no contract', async () => {
    const withContract = await loadWriterHiddenFactKeys(db({ pov: ['kaen'], learns: [] }), 7n, 1, facts as never);
    const without = await loadWriterHiddenFactKeys(db(null), 7n, 1, facts as never);

    expect([...withContract]).toEqual(['reveal_1']);
    expect([...without]).toEqual(['reveal_1']);
  });
});
