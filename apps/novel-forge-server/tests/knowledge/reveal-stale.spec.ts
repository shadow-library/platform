import { describe, expect, it } from 'bun:test';

import { commitFinalProse } from '@modules/ai/graphs/chapter-finalization.graph';
import { MilestoneService } from '@modules/bible/milestone/milestone.service';
import { GenerationService } from '@modules/generation/generation.service';
import { ledgerBriefReveals, markDescendantDraftsStale, reconcilePlanState, REVEAL_STALE_PREFIX } from '@server/common';
import { schema } from '@server/database';

import { FakeAuthoringClaims } from '../jobs/authoring-claim-fixtures';
import { type PlanSeed, planTables } from './plan-tables';

const learns = (...factKeys: string[]) => ({ pov: ['mira'], learns: factKeys.map(factKey => ({ entityKey: 'mira', factKey })) });
const RANK_FOUR = { milestoneKey: 'lamp_rank_4', label: 'Mira reaches the fourth rank' };
const RANK_FOUR_RULE = { factKey: 'lamp_rank_4_rule', text: 'The fourth rank costs a memory an hour.', unlock: { all: [{ milestone: 'lamp_rank_4' }] } };
const LOCKED_REASON = `${REVEAL_STALE_PREFIX}lamp_rank_4_rule (needs milestone lamp_rank_4 reached)`;

/** Chapter 4 claims the milestone, chapter 5 reveals what it unlocks, and chapter 5's draft is approved with the reveal ledgered. */
function revealedAfterClaim(overrides: PlanSeed = {}) {
  const tables = planTables({
    milestones: [RANK_FOUR],
    facts: [RANK_FOUR_RULE],
    entities: [{ entityKey: 'mira' }],
    briefs: [
      { chapter: 4, claimedMilestones: ['lamp_rank_4'] },
      { chapter: 5, knowledgeContract: learns('lamp_rank_4_rule') },
    ],
    drafts: [{ chapter: 5, reviewStatus: 'approved', revision: 2 }],
    ...overrides,
  });
  const [fact] = tables.rows(schema.canonFacts);
  const [mira] = tables.rows(schema.entities);
  tables
    .rows(schema.characterKnowledge)
    .push({ projectId: 7n, factId: fact?.['id'], entityId: mira?.['id'], learnedInChapter: 5, source: 'brief', status: 'provisional', draftRevision: 2 });
  return tables;
}

function generation(tables: ReturnType<typeof planTables>): GenerationService {
  const noop = {} as never;
  return new GenerationService(
    { getPostgresClient: () => tables.db } as never,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    new FakeAuthoringClaims().asService(),
    noop,
  );
}

describe('reconcilePlanState — a reveal that stops holding', () => {
  it('should mark the plan and its draft stale, reset the approval and revoke the reveal it ledgered', async () => {
    const tables = revealedAfterClaim();
    Object.assign(tables.brief(4) as object, { claimedMilestones: null });

    await reconcilePlanState(tables.db as never, 7n);

    expect(tables.brief(5)?.['staleReason']).toBe(LOCKED_REASON);
    expect(tables.draft(5)).toMatchObject({ staleReason: LOCKED_REASON, reviewStatus: 'needs_review' });
    expect(tables.rows(schema.characterKnowledge)).toEqual([]);
  });

  it('should mark the later drafts built on the revoked approval stale and reset their approvals', async () => {
    const tables = revealedAfterClaim({
      drafts: [
        { chapter: 5, reviewStatus: 'approved', revision: 2 },
        { chapter: 6, reviewStatus: 'approved', revision: 1 },
      ],
    });
    Object.assign(tables.brief(4) as object, { claimedMilestones: null });

    await reconcilePlanState(tables.db as never, 7n);

    expect(tables.draft(6)?.['reviewStatus']).toBe('needs_review');
    expect(tables.draft(6)?.['staleReason']).not.toBeNull();
  });

  it('should lift only its own mark from the draft once the reveal holds again, and keep an earlier reason the draft carried', async () => {
    const tables = revealedAfterClaim({ drafts: [{ chapter: 5, staleReason: LOCKED_REASON }] });
    Object.assign(tables.brief(5) as object, { staleReason: LOCKED_REASON });

    await reconcilePlanState(tables.db as never, 7n);
    expect(tables.brief(5)?.['staleReason']).toBeNull();
    expect(tables.draft(5)?.['staleReason']).toBeNull();

    const earlier = revealedAfterClaim({ drafts: [{ chapter: 5, staleReason: 'ancestor chapter 3 was chat_edited' }] });
    Object.assign(earlier.brief(4) as object, { claimedMilestones: null });
    await reconcilePlanState(earlier.db as never, 7n);
    expect(earlier.draft(5)?.['staleReason']).toBe('ancestor chapter 3 was chat_edited');
  });
});

describe('ledgerBriefReveals — reveal rule', () => {
  it('should skip a learn the rule refuses at the chapter and ledger the rest', async () => {
    const tables = planTables({
      milestones: [RANK_FOUR],
      facts: [RANK_FOUR_RULE, { factKey: 'lamp_costs_memory', text: 'The lamp costs memory.', revealChapter: 1 }],
      entities: [{ entityKey: 'mira' }],
      briefs: [{ chapter: 5, knowledgeContract: learns('lamp_rank_4_rule', 'lamp_costs_memory') }],
    });

    const result = await ledgerBriefReveals(tables.db as never, 7n, 5, 2);

    expect(result.applied).toBe(1);
    expect(tables.rows(schema.characterKnowledge).map(row => row['factId'])).toEqual([tables.fact('lamp_costs_memory')?.['id']]);
  });
});

describe('markDescendantDraftsStale over a reveal mark', () => {
  it('should keep a later draft stale for its ancestor after the plan that marked it is fixed', async () => {
    const tables = revealedAfterClaim({ drafts: [{ chapter: 5, revision: 2 }] });
    Object.assign(tables.brief(4) as object, { claimedMilestones: null });
    await reconcilePlanState(tables.db as never, 7n);
    expect(tables.draft(5)?.['staleReason']).toBe(LOCKED_REASON);

    await markDescendantDraftsStale(tables.db as never, 7n, 4, 'ancestor chapter 4 was hand_edited');
    Object.assign(tables.brief(4) as object, { claimedMilestones: ['lamp_rank_4'] });
    await reconcilePlanState(tables.db as never, 7n);

    expect(tables.brief(5)?.['staleReason']).toBeNull();
    expect(tables.draft(5)?.['staleReason']).toBe('ancestor chapter 4 was hand_edited');
  });

  it('should keep an earlier ancestor reason over a later one', async () => {
    const tables = revealedAfterClaim({ drafts: [{ chapter: 5, revision: 2, staleReason: 'ancestor chapter 3 was hand_edited' }] });

    await markDescendantDraftsStale(tables.db as never, 7n, 4, 'ancestor chapter 4 was hand_edited');

    expect(tables.draft(5)?.['staleReason']).toBe('ancestor chapter 3 was hand_edited');
  });
});

describe('GenerationService — approval and plans at the frontier', () => {
  it('should refuse to approve a draft whose plan reveals a locked fact', async () => {
    const tables = revealedAfterClaim({ drafts: [{ id: 55n, chapter: 5, revision: 2 }] });
    Object.assign(tables.brief(4) as object, { claimedMilestones: null });

    const refusal = await generation(tables)
      .approveDraft(7n, 5, { revision: 2, saveSeq: 0, draftId: 55n })
      .then(
        () => null,
        (err: { toResponse: () => unknown }) => err.toResponse(),
      );
    expect(refusal).toMatchObject({ code: 'PLN_004', details: { violations: [expect.objectContaining({ missing: expect.any(Array) })] } });
    expect(tables.draft(5)?.['reviewStatus']).toBe('needs_review');
  });

  it('should refuse a plan edit at a finalized chapter even while the story cursor is behind it', async () => {
    const tables = planTables({ chapters: [{ number: 6 }], briefs: [{ chapter: 6, body: 'Mira climbs.' }], storyCurrentChapter: 5 });

    await expect(generation(tables).updateBrief(7n, 6, { body: 'Mira falls.' })).rejects.toMatchObject({ code: 'PLN_005' });
    expect(tables.brief(6)?.['body']).toBe('Mira climbs.');
  });
});

describe('commitFinalProse — plan rules', () => {
  const input = { projectId: '7', chapter: 5, runId: 'run-1', draftId: '', draftRevision: 2, prose: 'The lamp burns cold.', summary: '', title: 'Cold Light' };

  function finalizing(tables: ReturnType<typeof planTables>) {
    const draftId = String(tables.draft(5)?.['id']);
    const insert = tables.db.insert;
    const db = { ...tables.db, insert: (table: unknown) => (table === schema.chapters ? { values: () => ({ onConflictDoUpdate: async () => undefined }) } : insert(table)) };
    db.transaction = async run => run(db);
    return commitFinalProse(db as never, { ...input, draftId, generator: 'standard', isolated: false });
  }

  it('should take the plan lock first and refuse to commit a chapter whose plan reveals a locked fact', async () => {
    const tables = revealedAfterClaim();
    Object.assign(tables.brief(4) as object, { claimedMilestones: null });

    await expect(finalizing(tables)).rejects.toMatchObject({ code: 'PLN_004' });
    expect(tables.locks[0]).toBe(schema.projects);
    expect(tables.draft(5)?.['status']).toBe('draft');
  });

  it('should commit a chapter whose reveal holds', async () => {
    const tables = revealedAfterClaim();

    await finalizing(tables);

    expect(tables.draft(5)?.['status']).toBe('final');
  });
});

describe('milestone subjects', () => {
  it('should refuse a subject that is not an entity of the novel', async () => {
    const tables = planTables({ entities: [{ entityKey: 'mira' }] });
    const service = new MilestoneService({ getPostgresClient: () => tables.db } as never);

    await expect(service.create(7n, { milestoneKey: 'lamp_rank_4', label: 'Fourth rank', subjectEntityKey: 'nobody' })).rejects.toMatchObject({ code: 'MIL_004' });
    await service.create(7n, { milestoneKey: 'lamp_rank_4', label: 'Fourth rank', subjectEntityKey: 'mira' });
    await expect(service.update(7n, 'lamp_rank_4', { subjectEntityKey: 'nobody' })).rejects.toMatchObject({ code: 'MIL_004' });
    expect(tables.milestone('lamp_rank_4')).toMatchObject({ subjectEntityKey: 'mira' });
  });
});
