import { describe, expect, it } from 'bun:test';

import { loadKnowledgeView, loadWriterHiddenFactKeys } from '@modules/bible/fact/knowledge-view';
import { schema } from '@server/database';

import { type PlanSeed, planTables } from './plan-tables';

const RANK_FOUR = { milestoneKey: 'lamp_rank_4', label: 'Mira reaches the fourth rank' };
const unlock = { all: [{ milestone: 'lamp_rank_4' }] };
const contract = { pov: ['mira'], learns: [{ entityKey: 'mira', factKey: 'lamp_rank_4_rule' }] };

function project(seed: PlanSeed) {
  return planTables({
    milestones: [RANK_FOUR],
    entities: [{ entityKey: 'mira' }],
    ...seed,
    facts: seed.facts ?? [{ factKey: 'lamp_rank_4_rule', text: 'The fourth rank costs a memory an hour.', unlock }],
  });
}

const keys = (facts: { factKey: string }[]) => facts.map(fact => fact.factKey);

describe('loadKnowledgeView — unlock conditions', () => {
  it("should hand the writer a learn only when the chapter's plan meets its unlock", async () => {
    const claims = project({ briefs: [{ chapter: 5, claimedMilestones: ['lamp_rank_4'], knowledgeContract: contract }] });
    const lacks = project({ briefs: [{ chapter: 5, knowledgeContract: contract }] });

    expect(keys((await loadKnowledgeView(claims.db as never, 7n, 5, contract)).reveals)).toEqual(['lamp_rank_4_rule']);
    const locked = await loadKnowledgeView(lacks.db as never, 7n, 5, contract);
    expect(locked.reveals).toEqual([]);
    expect(keys(locked.hidden)).toEqual(['lamp_rank_4_rule']);
  });

  it('should keep what the POV cast already learned known, whatever its unlock', async () => {
    const tables = project({ briefs: [{ chapter: 5 }] });
    const [fact] = tables.rows(schema.canonFacts);
    const [mira] = tables.rows(schema.entities);
    tables.rows(schema.characterKnowledge).push({ projectId: 7n, factId: fact?.['id'], entityId: mira?.['id'], learnedInChapter: 2, source: 'manual', status: 'committed' });

    expect(keys((await loadKnowledgeView(tables.db as never, 7n, 5, { pov: ['mira'], learns: [] })).known)).toEqual(['lamp_rank_4_rule']);
  });

  it('should not treat a chapter-one fact under an unlock condition as open canon', async () => {
    const tables = project({ facts: [{ factKey: 'lamp_rank_4_rule', text: 'The fourth rank costs a memory an hour.', revealChapter: 1, unlock }] });

    expect(keys((await loadKnowledgeView(tables.db as never, 7n, 3, { pov: ['mira'], learns: [] })).hidden)).toEqual(['lamp_rank_4_rule']);
  });
});

describe('loadWriterHiddenFactKeys — unlock conditions without a contract', () => {
  const dated = [{ factKey: 'lamp_rank_4_rule', text: 'The fourth rank costs a memory an hour.', revealChapter: 3, unlock }];

  it('should hide a dated fact past its chapter until its unlock holds for the chapter', async () => {
    const locked = project({ facts: dated, briefs: [{ chapter: 6 }] });
    const claimedEarlier = project({ facts: dated, briefs: [{ chapter: 4, claimedMilestones: ['lamp_rank_4'] }, { chapter: 6 }] });

    const lockedFacts = locked.rows(schema.canonFacts);
    const claimedFacts = claimedEarlier.rows(schema.canonFacts);
    expect([...(await loadWriterHiddenFactKeys(locked.db as never, 7n, 6, lockedFacts as never))]).toEqual(['lamp_rank_4_rule']);
    expect([...(await loadWriterHiddenFactKeys(claimedEarlier.db as never, 7n, 6, claimedFacts as never))]).toEqual([]);
  });
});
