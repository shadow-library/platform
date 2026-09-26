import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { reviewRefusal, type ReviewWithItems } from '@modules/finalize-review/finalize-review-gate';
import { buildReviewItems, editedChange, type ReviewMaterial } from '@modules/finalize-review/finalize-review-items';
import { applyKeptItems, type ChangeApplier, drizzleRowStore, type KeptItem, revertAppliedItems, type RowRef, type RowStore } from '@modules/finalize-review/review-event-apply';
import { hashReviewedBody } from '@modules/review/review-findings';
import { type ContinuityOutput } from '@modules/ai/schemas';
import { type FinalizeReview, schema } from '@server/database';

const PROSE = 'Mira climbs the tower and the lamp burns cold.';

const EXTRACTION: ContinuityOutput = {
  appeared: ['mira'],
  newEntities: [],
  threads: [{ threadKey: 'lamp_debt', status: 'closed', summary: 'Mira repays the keeper' }],
  mysteries: [],
  timeline: [],
  relationships: [],
  power: [],
  characterStates: [{ entityKey: 'mira', location: 'the tower', evidence: 'Mira climbs the tower' }],
  knowledgeChanges: [],
  chapterSummary: 'Mira climbs.',
  milestones: [],
};

function material(overrides: Partial<ReviewMaterial> = {}): ReviewMaterial {
  return {
    extraction: EXTRACTION,
    isolated: false,
    claimedMilestones: ['lamp_rank_4'],
    milestones: [{ milestoneKey: 'lamp_rank_4', label: 'Mira reaches the fourth rank', state: 'planned' }],
    entityKeys: new Set(['mira']),
    plannedLearns: new Set(),
    plannedFactKeys: ['lamp_rank_4_rule'],
    facts: [{ factKey: 'lamp_rank_4_rule', revealChapter: null, unlock: { all: [{ milestone: 'lamp_rank_4' }] }, source: 'manual' }],
    unlock: { chapter: 5, endingChapter: null, volumeKey: null, volumeOrdinals: new Map(), reachedMilestones: new Set(['lamp_rank_4']) },
    autoKeep: new Set(),
    ...overrides,
  };
}

function review(items: Partial<FinalizeReview.Item>[], overrides: Partial<ReviewWithItems> = {}): ReviewWithItems {
  return {
    id: 1n,
    projectId: 7n,
    chapter: 5,
    draftId: 55n,
    draftRevision: 3,
    sourceHash: hashReviewedBody(PROSE),
    planHash: null,
    isolated: false,
    bridgeOnly: false,
    status: 'ready',
    jobId: null,
    error: null,
    applied: null,
    appliedAt: null,
    revertedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: items as FinalizeReview.Item[],
    ...overrides,
  };
}

describe('buildReviewItems', () => {
  it('should flag a claimed milestone the prose missed and propose it stays locked, naming the reveals that need it', () => {
    const [missed] = buildReviewItems(material()).filter(item => item.category === 'milestone');

    expect(missed).toMatchObject({
      triage: 'consequential',
      flag: 'missed_milestone',
      proposed: { category: 'milestone', milestoneKey: 'lamp_rank_4', reached: false },
      dependents: ['lamp_rank_4_rule'],
      decision: null,
    });
  });

  it('should propose a claimed milestone the prose reached as a routine update', () => {
    const extraction = { ...EXTRACTION, milestones: [{ milestoneKey: 'lamp_rank_4', reached: true, evidence: 'the lamp burns cold' }] };
    const [reached] = buildReviewItems(material({ extraction })).filter(item => item.category === 'milestone');

    expect(reached).toMatchObject({ triage: 'routine', flag: null, proposed: { reached: true } });
  });

  it('should keep routine items of an auto-keep category at once and leave payoffs to the author', () => {
    const items = buildReviewItems(material({ autoKeep: new Set(['appearance', 'character_state', 'promise']) }));

    expect(items.map(item => [item.category, item.triage, item.decision, item.autoKept])).toEqual([
      ['appearance', 'routine', 'kept', true],
      ['character_state', 'routine', 'kept', true],
      ['promise', 'consequential', null, false],
      ['milestone', 'consequential', null, false],
    ]);
  });

  it('should never keep anything automatically on an isolated chapter', () => {
    const items = buildReviewItems(material({ isolated: true, autoKeep: new Set(['appearance', 'character_state']) }));

    expect(items.every(item => item.decision === null && !item.autoKept)).toBe(true);
  });

  it('should key an item by the record it is about, so a re-read worded differently is the same item', () => {
    const reworded = {
      ...EXTRACTION,
      threads: [{ threadKey: 'lamp_debt', status: 'closed' as const, summary: 'The keeper is repaid in full' }],
      characterStates: [{ entityKey: 'mira', location: 'the tower top', evidence: 'She stands on the tower' }],
    };

    expect(buildReviewItems(material({ extraction: reworded })).map(item => item.itemKey)).toEqual(buildReviewItems(material()).map(item => item.itemKey));
  });

  it('should name the reveals a claimed milestone carries even when the prose reached it', () => {
    const extraction = { ...EXTRACTION, milestones: [{ milestoneKey: 'lamp_rank_4', reached: true }] };
    const [reached] = buildReviewItems(material({ extraction })).filter(item => item.category === 'milestone');

    expect(reached?.dependents).toEqual(['lamp_rank_4_rule']);
  });

  it('should withhold every excerpt read from an isolated chapter', () => {
    const [state] = buildReviewItems(material({ isolated: true })).filter(item => item.category === 'character_state');

    expect(state?.evidence).not.toContain('tower');
  });
});

describe('editedChange', () => {
  it('should lay the inline edit over the proposal and refuse one that renames the record', () => {
    const proposed = { category: 'character_state' as const, state: { entityKey: 'mira', location: 'the tower', evidence: 'x' } };

    expect(editedChange(proposed, { location: 'the lighthouse' })).toEqual({
      change: { category: 'character_state', state: { entityKey: 'mira', location: 'the lighthouse', evidence: 'x' } },
    });
    expect(editedChange(proposed, { entityKey: 'oren' })).toEqual({ refused: 'entityKey cannot be edited here' });
  });
});

describe('reviewRefusal', () => {
  const decided = [{ flag: null, dependents: null, decision: 'kept' as const, proposed: { category: 'appearance', entityKey: 'mira' }, edited: null }];

  it('should let a chapter approved before reviews existed finalize on the direct path', () => {
    expect(reviewRefusal([], { revision: 3, body: PROSE })).toBeNull();
  });

  it('should invalidate the review once the prose is edited after approval', () => {
    expect(reviewRefusal([review(decided)], { revision: 4, body: `${PROSE} Edited.` })).toMatchObject({ code: 'FRV_004' });
  });

  it('should refuse a finalize whose prose does not hash to the reviewed source', () => {
    expect(reviewRefusal([review(decided)], { revision: 3, body: 'Other prose at the same revision.' })).toMatchObject({ code: 'FRV_004' });
    expect(reviewRefusal([review(decided)], { revision: 3, body: PROSE })).toBeNull();
  });

  it('should refuse while an item is unanswered or the review is still being read', () => {
    expect(reviewRefusal([review([{ ...decided[0], decision: null }])], { revision: 3, body: PROSE })).toMatchObject({ code: 'FRV_005' });
    expect(reviewRefusal([review(decided, { status: 'preparing' })], { revision: 3, body: PROSE })).toMatchObject({ code: 'FRV_002' });
  });

  it('should refuse a missed milestone left locked while the plan reveals what it unlocks, until the author keeps it reached', () => {
    const missed = {
      category: 'milestone' as const,
      flag: 'missed_milestone' as const,
      subjectKey: 'lamp_rank_4',
      dependents: ['lamp_rank_4_rule'],
      proposed: { category: 'milestone', milestoneKey: 'lamp_rank_4', reached: false },
    };

    expect(reviewRefusal([review([{ ...missed, decision: 'kept', edited: null }])], { revision: 3, body: PROSE })).toMatchObject({ code: 'FRV_006' });
    const reached = { ...missed, decision: 'edited' as const, edited: { ...missed.proposed, reached: true } };
    expect(reviewRefusal([review([reached])], { revision: 3, body: PROSE })).toBeNull();
  });

  it('should refuse when a routine "reached" milestone the plan reveals through is skipped or edited to not reached', () => {
    const routine = {
      category: 'milestone' as const,
      flag: null,
      subjectKey: 'lamp_rank_4',
      dependents: ['lamp_rank_4_rule'],
      proposed: { category: 'milestone', milestoneKey: 'lamp_rank_4', reached: true },
    };

    expect(reviewRefusal([review([{ ...routine, decision: 'skipped', edited: null }])], { revision: 3, body: PROSE })).toMatchObject({ code: 'FRV_006' });
    const unreached = { ...routine, decision: 'edited' as const, edited: { ...routine.proposed, reached: false } };
    expect(reviewRefusal([review([unreached])], { revision: 3, body: PROSE })).toMatchObject({ code: 'FRV_006' });
    expect(reviewRefusal([review([{ ...routine, decision: 'kept', edited: null }])], { revision: 3, body: PROSE })).toBeNull();
  });
});

describe('applyKeptItems / revertAppliedItems', () => {
  function memoryStore(seed: Record<string, Record<string, unknown>>, laterReferences = 0) {
    const rows = new Map(Object.entries(seed));
    const key = (ref: RowRef) => `${ref.table}:${JSON.stringify(ref.match)}`;
    const store: RowStore = {
      read: async ref => rows.get(key(ref)) ?? null,
      write: async (ref, row) => void (row === null ? rows.delete(key(ref)) : rows.set(key(ref), row)),
      entityReferenced: async () => laterReferences > 0,
    };
    return { store, rows, key };
  }

  it("should refuse to undo a created entity another character's relationship now names as its target", async () => {
    const entityRef: RowRef = { table: 'entities', match: { projectId: '7', entityKey: 'oren' } };
    const created = { id: 9n, projectId: 7n, entityKey: 'oren', name: 'Oren' };
    const dialect = new PgDialect();
    const exists = (table: unknown, where: SQL) => table === schema.entityRelationships && dialect.sqlToQuery(where).sql.includes('"target_key"');
    const tx = {
      select: () => ({
        from: (table: unknown) => ({
          where: (where: SQL) => ({ for: async () => (table === schema.entities ? [created] : []), limit: async () => (exists(table, where) ? [{ one: 1 }] : []) }),
        }),
      }),
    };
    const stored = { id: '9', projectId: '7', entityKey: 'oren', name: 'Oren' };
    const applied = [{ itemId: '1', changes: [{ table: 'entities', match: entityRef.match, before: null, after: stored }] }];

    await expect(revertAppliedItems(drizzleRowStore(tx as never), applied)).rejects.toMatchObject({ code: 'FRV_007' });
  });

  it('should refuse to undo a created entity that later rows now reference, rather than cascade them away', async () => {
    const entityRef: RowRef = { table: 'entities', match: { projectId: '7', entityKey: 'oren' } };
    const created = { id: '9', entityKey: 'oren', name: 'Oren' };
    const applied = [{ itemId: '1', changes: [{ table: 'entities', match: entityRef.match, before: null, after: created }] }];

    const referenced = memoryStore({ [`entities:${JSON.stringify(entityRef.match)}`]: created }, 1);
    await expect(revertAppliedItems(referenced.store, applied)).rejects.toMatchObject({ code: 'FRV_007' });
    expect(referenced.rows.size).toBe(1);

    const alone = memoryStore({ [`entities:${JSON.stringify(entityRef.match)}`]: created });
    await revertAppliedItems(alone.store, applied);
    expect(alone.rows.size).toBe(0);
  });
  const threadRef: RowRef = { table: 'plot_threads', match: { projectId: '7', threadKey: 'lamp_debt' } };
  const stateRef: RowRef = { table: 'character_states', match: { projectId: '7', entityKey: 'mira' } };
  const items: KeptItem[] = [
    { id: 1n, decision: 'kept', edited: null, proposed: { category: 'promise', thread: { threadKey: 'lamp_debt', status: 'closed' } } },
    { id: 2n, decision: 'kept', edited: null, proposed: { category: 'character_state', state: { entityKey: 'mira', location: 'the tower', evidence: '' } } },
  ];
  function applier(memory: ReturnType<typeof memoryStore>): ChangeApplier {
    return {
      touched: async item => [(item.proposed as { category: string }).category === 'promise' ? threadRef : stateRef],
      apply: async item =>
        (item.proposed as { category: string }).category === 'promise'
          ? void memory.rows.set(memory.key(threadRef), { threadKey: 'lamp_debt', status: 'closed', closedChapter: 5 })
          : void memory.rows.set(memory.key(stateRef), { entityKey: 'mira', location: 'the tower' }),
    };
  }

  it('should put the Story Bible back exactly as it was when the kept set is reverted', async () => {
    const memory = memoryStore({ [`plot_threads:${JSON.stringify(threadRef.match)}`]: { threadKey: 'lamp_debt', status: 'open', closedChapter: null } });
    const before = new Map(memory.rows);

    const applied = await applyKeptItems(memory.store, applier(memory), items);
    expect(applied.map(item => item.changes.map(change => change.table))).toEqual([['plot_threads'], ['character_states']]);

    await revertAppliedItems(memory.store, applied);
    expect(memory.rows).toEqual(before);
  });

  it('should refuse the whole undo when a row changed after the kept set was applied', async () => {
    const memory = memoryStore({});
    const applied = await applyKeptItems(memory.store, applier(memory), items);
    memory.rows.set(memory.key(threadRef), { threadKey: 'lamp_debt', status: 'open', closedChapter: null });

    await expect(revertAppliedItems(memory.store, applied)).rejects.toMatchObject({ code: 'FRV_007' });
  });
});
