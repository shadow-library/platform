import { describe, expect, it } from 'bun:test';

import { commitFinalProse } from '@modules/ai/graphs/chapter-finalization.graph';
import { MilestoneService } from '@modules/bible/milestone/milestone.service';
import { enforcePlanWrite, reachClaimedMilestones, reconcilePlanState, REVEAL_STALE_PREFIX } from '@server/common';
import { schema } from '@server/database';

import { planTables } from './plan-tables';

const learns = (...factKeys: string[]) => ({ pov: ['mira'], learns: factKeys.map(factKey => ({ entityKey: 'mira', factKey })) });
const RANK_FOUR = { milestoneKey: 'lamp_rank_4', label: 'Mira reaches the fourth rank' };
const RANK_FOUR_RULE = { factKey: 'lamp_rank_4_rule', text: 'The fourth rank trades a memory for each hour of light.', unlock: { all: [{ milestone: 'lamp_rank_4' }] } };

describe('enforcePlanWrite', () => {
  it('should refuse a plan that reveals a fact whose unlock it does not meet, listing the fact and what is missing', async () => {
    const { db } = planTables({ milestones: [RANK_FOUR], facts: [RANK_FOUR_RULE], briefs: [{ chapter: 5, knowledgeContract: learns('lamp_rank_4_rule') }] });

    const refused = enforcePlanWrite(db as never, 7n, [5]);

    await expect(refused).rejects.toMatchObject({ code: 'PLN_001' });
    await expect(refused).rejects.toThrow('lamp_rank_4_rule (needs milestone lamp_rank_4 reached)');
  });

  it('should refuse a plan that reveals an undated secret with no condition', async () => {
    const { db } = planTables({ facts: [{ factKey: 'lamp_is_alive', text: 'The lamp is alive.' }], briefs: [{ chapter: 5, knowledgeContract: learns('lamp_is_alive') }] });

    await expect(enforcePlanWrite(db as never, 7n, [5])).rejects.toThrow('lamp_is_alive (needs a reveal chapter or an unlock condition)');
  });

  it('should refuse a second ending and a claim another plan already holds', async () => {
    const ending = planTables({
      briefs: [
        { chapter: 40, isEnding: true },
        { chapter: 41, isEnding: true },
      ],
    });
    await expect(enforcePlanWrite(ending.db as never, 7n, [41])).rejects.toMatchObject({ code: 'PLN_002', message: expect.stringContaining('Chapter 40') });

    const claimed = planTables({ milestones: [RANK_FOUR], briefs: [4, 6].map(chapter => ({ chapter, claimedMilestones: ['lamp_rank_4'] })) });
    await expect(enforcePlanWrite(claimed.db as never, 7n, [6])).rejects.toMatchObject({ code: 'PLN_003' });
  });

  it('should accept a reveal the plan unlocks with its own claim, planning the milestone and dating the fact to it', async () => {
    const { db, milestone, fact } = planTables({
      milestones: [RANK_FOUR],
      facts: [RANK_FOUR_RULE],
      briefs: [{ chapter: 5, claimedMilestones: ['lamp_rank_4'], knowledgeContract: learns('lamp_rank_4_rule') }],
    });

    await enforcePlanWrite(db as never, 7n, [5]);

    expect(milestone('lamp_rank_4')).toMatchObject({ state: 'planned', plannedChapter: 5 });
    expect(fact('lamp_rank_4_rule')).toMatchObject({ plannedChapter: 5 });
  });
});

describe('reconcilePlanState', () => {
  function claimedAtFourRevealedAtSeven() {
    return planTables({
      milestones: [RANK_FOUR],
      facts: [RANK_FOUR_RULE],
      briefs: [
        { chapter: 4, claimedMilestones: ['lamp_rank_4'] },
        { chapter: 7, knowledgeContract: learns('lamp_rank_4_rule') },
      ],
    });
  }

  it('should return a milestone to open and clear the dated reveal when the claiming plan drops it, marking the plan that relied on it stale', async () => {
    const tables = claimedAtFourRevealedAtSeven();
    await reconcilePlanState(tables.db as never, 7n);
    expect(tables.fact('lamp_rank_4_rule')).toMatchObject({ plannedChapter: 7 });

    Object.assign(tables.brief(4) as object, { claimedMilestones: null });
    await reconcilePlanState(tables.db as never, 7n);

    expect(tables.milestone('lamp_rank_4')).toMatchObject({ state: 'open', plannedChapter: null });
    expect(tables.fact('lamp_rank_4_rule')).toMatchObject({ plannedChapter: null });
    expect(tables.brief(7)?.['staleReason']).toBe(`${REVEAL_STALE_PREFIX}lamp_rank_4_rule (needs milestone lamp_rank_4 reached)`);
  });

  it('should lift its own stale mark once the reveal holds again, and never touch a stale mark it did not set', async () => {
    const tables = claimedAtFourRevealedAtSeven();
    Object.assign(tables.brief(7) as object, { staleReason: `${REVEAL_STALE_PREFIX}lamp_rank_4_rule (needs milestone lamp_rank_4 reached)` });
    await reconcilePlanState(tables.db as never, 7n);
    expect(tables.brief(7)?.['staleReason']).toBeNull();

    Object.assign(tables.brief(4) as object, { claimedMilestones: null });
    Object.assign(tables.brief(7) as object, { staleReason: 'a chapter was inserted after this point' });
    await reconcilePlanState(tables.db as never, 7n);
    expect(tables.brief(7)?.['staleReason']).toBe('a chapter was inserted after this point');
  });

  it('should leave a reached milestone reached when its plan changes, and never mark a finalized chapter stale', async () => {
    const tables = planTables({
      storyCurrentChapter: 7,
      milestones: [{ ...RANK_FOUR, state: 'reached', plannedChapter: 4, reachedChapter: 4, boundRevision: 3 }],
      facts: [RANK_FOUR_RULE],
      briefs: [{ chapter: 4 }, { chapter: 7, knowledgeContract: learns('lamp_rank_4_rule') }],
    });

    await reconcilePlanState(tables.db as never, 7n);

    expect(tables.milestone('lamp_rank_4')).toMatchObject({ state: 'reached', reachedChapter: 4, boundRevision: 3 });
    expect(tables.brief(7)?.['staleReason']).toBeNull();
  });
});

describe('reachClaimedMilestones', () => {
  it('should reach what the finalized chapter claims, bound to the committed revision, and leave an already reached milestone as it was', async () => {
    const tables = planTables({
      milestones: [RANK_FOUR, { milestoneKey: 'lamp_rank_3', label: 'Third rank', state: 'reached', reachedChapter: 2, boundRevision: 1 }],
      briefs: [{ chapter: 4, claimedMilestones: ['lamp_rank_4', 'lamp_rank_3'] }],
    });

    await reachClaimedMilestones(tables.db as never, 7n, 4, 6);

    expect(tables.milestone('lamp_rank_4')).toMatchObject({ state: 'reached', plannedChapter: 4, reachedChapter: 4, boundRevision: 6 });
    expect(tables.milestone('lamp_rank_3')).toMatchObject({ reachedChapter: 2, boundRevision: 1 });
  });

  it('should reach the claimed milestones in the finalization commit', async () => {
    const tables = planTables({ milestones: [RANK_FOUR], briefs: [{ chapter: 4, claimedMilestones: ['lamp_rank_4'] }] });
    tables.rows(schema.drafts).push({ id: 11n, projectId: 7n, chapter: 4, revision: 2, status: 'draft', reviewStatus: 'approved' });
    const input = { projectId: '7', chapter: 4, runId: 'run-1', draftId: '11', draftRevision: 2, prose: 'The lamp burns cold.', summary: '', title: 'Cold Light' };
    const insertChapter = tables.db.insert;
    const db = {
      ...tables.db,
      insert: (table: unknown) => (table === schema.chapters ? { values: () => ({ onConflictDoUpdate: async () => undefined }) } : insertChapter(table)),
    };
    db.transaction = async run => run(db);

    await commitFinalProse(db as never, { ...input, generator: 'standard', isolated: false });

    expect(tables.milestone('lamp_rank_4')).toMatchObject({ state: 'reached', reachedChapter: 4, boundRevision: 2 });
  });
});

describe('MilestoneService.delete', () => {
  it('should refuse while a plan claims the milestone or a fact unlock names it, naming each reference', async () => {
    const tables = planTables({ milestones: [RANK_FOUR], facts: [RANK_FOUR_RULE], briefs: [{ chapter: 4, claimedMilestones: ['lamp_rank_4'] }] });
    const service = new MilestoneService({ getPostgresClient: () => tables.db } as never);

    const refused = service.delete(7n, 'lamp_rank_4');

    await expect(refused).rejects.toMatchObject({ code: 'MIL_003' });
    await expect(refused).rejects.toThrow('the plan for chapter 4, the unlock of fact lamp_rank_4_rule');
    expect(tables.milestone('lamp_rank_4')).toBeDefined();
  });

  it('should delete a milestone nothing references, under the plan lock', async () => {
    const tables = planTables({ milestones: [RANK_FOUR] });
    const service = new MilestoneService({ getPostgresClient: () => tables.db } as never);

    await service.delete(7n, 'lamp_rank_4');

    expect(tables.milestone('lamp_rank_4')).toBeUndefined();
    expect(tables.locks).toEqual([schema.projects]);
    await expect(service.delete(7n, 'lamp_rank_4')).rejects.toMatchObject({ code: 'MIL_001' });
  });
});
