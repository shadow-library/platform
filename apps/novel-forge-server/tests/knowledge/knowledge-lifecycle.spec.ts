import { describe, expect, it } from 'bun:test';

import { commitFinalProse } from '@modules/ai/graphs/chapter-finalization.graph';
import { loadKnowledgeView, loadWriterForbiddenFacts, loadWriterHiddenFactKeys, renderJudgeReaderKnows, renderReaderKnows } from '@modules/bible/fact/knowledge-view';
import { type GenerationService } from '@modules/generation/generation.service';
import { resetApprovalForPlanChange, revokeProvisionalReveals } from '@server/common';
import { schema } from '@server/database';

import { makeGenerationService } from '../generation/generation-fixtures';
import { planTables } from './plan-tables';

type Tables = ReturnType<typeof planTables>;

const CONTRACT = { pov: ['mira', 'oren'], learns: [{ entityKey: 'mira', factKey: 'lamp_rank_4_rule' }] };
const RANK_FOUR_RULE = { factKey: 'lamp_rank_4_rule', text: 'The fourth rank costs a memory an hour.', unlock: { all: [{ milestone: 'lamp_rank_4' }] } };

/** Chapter 5's plan claims the fourth rank and reveals what it unlocks to Mira; its draft sits at revision 2, unapproved. */
function chapterFive(): Tables {
  return planTables({
    milestones: [{ milestoneKey: 'lamp_rank_4', label: 'Mira reaches the fourth rank' }],
    facts: [RANK_FOUR_RULE],
    entities: [
      { entityKey: 'mira', name: 'Mira' },
      { entityKey: 'oren', name: 'Oren' },
    ],
    briefs: [{ chapter: 5, claimedMilestones: ['lamp_rank_4'], knowledgeContract: CONTRACT }],
    drafts: [{ chapter: 5, revision: 2 }],
    storyCurrentChapter: 4,
  });
}

const generation = (tables: Tables): GenerationService => makeGenerationService(tables.db);

function editDraft(tables: Tables): Promise<void> {
  Object.assign(tables.draft(5) as object, { revision: (tables.draft(5)?.['revision'] as number) + 1, reviewStatus: 'needs_review' });
  return revokeProvisionalReveals(tables.db as never, 7n, 5);
}

function finalize(tables: Tables, draftRevision: number, draftId = String(tables.draft(5)?.['id'])): Promise<void> {
  const insert = tables.db.insert;
  const db = { ...tables.db, insert: (table: unknown) => (table === schema.chapters ? { values: () => ({ onConflictDoUpdate: async () => undefined }) } : insert(table)) };
  db.transaction = async run => run(db);
  const input = { projectId: '7', chapter: 5, runId: 'run-1', draftId: draftId || null, draftRevision, prose: 'The lamp burns cold.', summary: '' };
  return commitFinalProse(db as never, { ...input, title: 'Cold Light', generator: 'standard', isolated: false });
}

function approvedChapterSix(tables: Tables): Record<string, unknown> {
  const draft = { id: 98n, projectId: 7n, chapter: 6, status: 'draft', reviewStatus: 'approved', staleReason: null, revision: 1, isolated: false };
  tables.rows(schema.drafts).push(draft);
  return draft;
}

const ledger = (tables: Tables) => tables.rows(schema.characterKnowledge).map(row => ({ chapter: row['learnedInChapter'], status: row['status'], revision: row['draftRevision'] }));
const view = (tables: Tables, chapter: number) => loadKnowledgeView(tables.db as never, 7n, chapter, CONTRACT, { readerKnows: false });

describe('knowledge lifecycle — approval', () => {
  it('should leave exactly one provisional set, bound to the latest approved revision, across approve → edit → approve cycles', async () => {
    const tables = chapterFive();
    const service = generation(tables);

    await service.approveDraft(7n, 5, { revision: 2 });
    expect(ledger(tables)).toEqual([{ chapter: 5, status: 'provisional', revision: 2 }]);

    await editDraft(tables);
    expect(ledger(tables)).toEqual([]);

    await service.approveDraft(7n, 5, { revision: 3 });
    await editDraft(tables);
    await service.approveDraft(7n, 5, { revision: 4 });
    await service.approveDraft(7n, 5, { revision: 4 });
    expect(ledger(tables)).toEqual([{ chapter: 5, status: 'provisional', revision: 4 }]);
  });

  it('should rebind the set to the revision being approved even when nothing revoked the earlier approval', async () => {
    const tables = chapterFive();
    const service = generation(tables);
    await service.approveDraft(7n, 5, { revision: 2 });
    Object.assign(tables.draft(5) as object, { revision: 3 });

    await service.approveDraft(7n, 5, { revision: 3 });

    expect(ledger(tables)).toEqual([{ chapter: 5, status: 'provisional', revision: 3 }]);
  });

  it("should hand an approved chapter's reveals to the next chapter as known, never hidden, scrubbed or forbidden", async () => {
    const tables = chapterFive();
    tables.rows(schema.briefs).push({ id: 99n, projectId: 7n, chapter: 6, knowledgeContract: { pov: ['mira'], learns: [] }, endingContract: null, claimedMilestones: null });
    await generation(tables).approveDraft(7n, 5, { revision: 2 });

    const own = await view(tables, 5);
    const next = await view(tables, 6);

    expect(own.reveals.map(fact => fact.factKey)).toEqual(['lamp_rank_4_rule']);
    expect(own.pooledPov).toEqual([
      { entityKey: 'mira', name: 'Mira' },
      { entityKey: 'oren', name: 'Oren' },
    ]);
    expect(next.known.map(fact => fact.factKey)).toEqual(['lamp_rank_4_rule']);
    expect(next.hidden).toEqual([]);
    expect([...(await loadWriterHiddenFactKeys(tables.db as never, 7n, 6, tables.rows(schema.canonFacts) as never))]).toEqual([]);
    expect(await loadWriterForbiddenFacts(tables.db as never, 7n, 6)).toEqual([]);
  });
});

describe('knowledge lifecycle — a plan edit after approval', () => {
  it('should reset the approval and revoke its reveals, so finalize refuses until the author approves the new plan', async () => {
    const tables = chapterFive();
    const service = generation(tables);
    await service.approveDraft(7n, 5, { revision: 2 });
    const later = approvedChapterSix(tables);

    await service.updateBrief(7n, 5, { body: 'Mira keeps the rank a secret.', knowledgeContract: { pov: ['mira', 'oren'], learns: [] } });

    expect(tables.draft(5)?.['reviewStatus']).toBe('needs_review');
    expect(ledger(tables)).toEqual([]);
    expect(later).toMatchObject({ reviewStatus: 'needs_review', staleReason: expect.anything() });
    await expect(finalize(tables, 2)).rejects.toMatchObject({ code: 'DRF_004' });
  });

  it('should reset the approval when only the claimed milestones change, leaving later drafts as they were', async () => {
    const tables = chapterFive();
    const service = generation(tables);
    await service.approveDraft(7n, 5, { revision: 2 });
    const later = approvedChapterSix(tables);

    await resetApprovalForPlanChange(tables.db as never, 7n, 5, tables.brief(5), { knowledgeContract: CONTRACT, claimedMilestones: [] });

    expect(tables.draft(5)?.['reviewStatus']).toBe('needs_review');
    expect(later).toMatchObject({ reviewStatus: 'approved', staleReason: null });
  });

  it('should keep the approval through an edit that leaves what the chapter teaches and claims alone', async () => {
    const tables = chapterFive();
    const service = generation(tables);
    await service.approveDraft(7n, 5, { revision: 2 });

    await service.updateBrief(7n, 5, { body: 'Mira climbs the tower at dusk.' });

    expect(tables.draft(5)?.['reviewStatus']).toBe('approved');
    expect(ledger(tables)).toEqual([{ chapter: 5, status: 'provisional', revision: 2 }]);
  });
});

describe('knowledge lifecycle — finalize', () => {
  it('should commit the provisional rows, disclose the reveal to the reader and reach the claimed milestone', async () => {
    const tables = chapterFive();
    await generation(tables).approveDraft(7n, 5, { revision: 2 });

    await finalize(tables, 2);

    expect(ledger(tables)).toEqual([{ chapter: 5, status: 'committed', revision: 2 }]);
    expect(tables.fact('lamp_rank_4_rule')?.['disclosedInChapter']).toBe(5);
    expect(tables.milestone('lamp_rank_4')).toMatchObject({ state: 'reached', reachedChapter: 5, boundRevision: 2 });
    expect((await view(tables, 6)).known.map(fact => fact.factKey)).toEqual(['lamp_rank_4_rule']);
  });

  it('should change nothing when a finalization is replayed', async () => {
    const tables = chapterFive();
    await generation(tables).approveDraft(7n, 5, { revision: 2 });
    await finalize(tables, 2);
    const snapshot = structuredClone({ knowledge: tables.rows(schema.characterKnowledge), facts: tables.rows(schema.canonFacts), milestones: tables.rows(schema.milestones) });

    await finalize(tables, 2);

    expect({ knowledge: tables.rows(schema.characterKnowledge), facts: tables.rows(schema.canonFacts), milestones: tables.rows(schema.milestones) }).toEqual(snapshot);
  });

  it('should keep the disclosure of an earlier chapter that already showed the reader the fact', async () => {
    const tables = chapterFive();
    Object.assign(tables.fact('lamp_rank_4_rule') as object, { disclosedInChapter: 3 });
    await generation(tables).approveDraft(7n, 5, { revision: 2 });

    await finalize(tables, 2);

    expect(tables.fact('lamp_rank_4_rule')?.['disclosedInChapter']).toBe(3);
  });
});

describe('knowledge lifecycle — approve and finalize racing', () => {
  it('should refuse an approval that lands after the finalize committed, leaving the knowledge committed', async () => {
    const tables = chapterFive();
    const service = generation(tables);
    await service.approveDraft(7n, 5, { revision: 2 });
    await finalize(tables, 2);

    await expect(service.approveDraft(7n, 5, { revision: 2 })).rejects.toMatchObject({ code: 'DRF_002' });
    expect(ledger(tables)).toEqual([{ chapter: 5, status: 'committed', revision: 2 }]);
  });

  it('should refuse a finalize of a revision an edit and a new approval replaced, leaving the new approval provisional', async () => {
    const tables = chapterFive();
    const service = generation(tables);
    await service.approveDraft(7n, 5, { revision: 2 });
    await editDraft(tables);
    await service.approveDraft(7n, 5, { revision: 3 });

    await expect(finalize(tables, 2)).rejects.toMatchObject({ code: 'DRF_013' });
    expect(ledger(tables)).toEqual([{ chapter: 5, status: 'provisional', revision: 3 }]);
    expect(tables.fact('lamp_rank_4_rule')?.['disclosedInChapter']).toBeNull();
    expect(tables.milestone('lamp_rank_4')?.['state']).not.toBe('reached');
  });
});

describe('loadKnowledgeView — reader knows', () => {
  function disclosedEarlier(): Tables {
    const tables = chapterFive();
    Object.assign(tables.fact('lamp_rank_4_rule') as object, { disclosedInChapter: 3 });
    return tables;
  }
  const noLearns = { pov: ['mira'], learns: [] };

  it('should keep a fact the reader was shown hidden from the writer while the label is off', async () => {
    const off = await loadKnowledgeView(disclosedEarlier().db as never, 7n, 5, noLearns, { readerKnows: false });

    expect(off.readerKnows).toEqual([]);
    expect(off.hidden.map(fact => fact.factKey)).toEqual(['lamp_rank_4_rule']);
  });

  it('should give the judge the reader-knows block only while the label is on', async () => {
    const off = await loadKnowledgeView(disclosedEarlier().db as never, 7n, 5, noLearns, { readerKnows: false });
    const on = await loadKnowledgeView(disclosedEarlier().db as never, 7n, 5, noLearns, { readerKnows: true });

    expect(renderJudgeReaderKnows(off.readerKnows)).toBe('');
    expect(renderJudgeReaderKnows(on.readerKnows)).toContain('## THE READER KNOWS, THE POV CAST DOES NOT\n- [lamp_rank_4_rule]');
  });

  it('should move it to the labelled reader-knows list when the label is on, keeping its writer note', async () => {
    const tables = disclosedEarlier();
    Object.assign(tables.fact('lamp_rank_4_rule') as object, { writerNote: 'Mira still fears the fourth rank.' });

    const on = await loadKnowledgeView(tables.db as never, 7n, 5, noLearns, { readerKnows: true });

    expect(on.readerKnows.map(fact => fact.factKey)).toEqual(['lamp_rank_4_rule']);
    expect(on.hidden).toEqual([]);
    expect(renderReaderKnows(on.readerKnows, on.pooledPov)).toBe(
      '- [lamp_rank_4_rule] The fourth rank costs a memory an hour. — the reader knows; Mira does not — Mira still fears the fourth rank.',
    );
  });

  it("should keep a fact the chapter's ending contract must not resolve hidden even when the label is on", async () => {
    const tables = disclosedEarlier();
    Object.assign(tables.brief(5) as object, { endingContract: { mustNotResolve: ['fact:lamp_rank_4_rule'] } });

    const on = await loadKnowledgeView(tables.db as never, 7n, 5, noLearns, { readerKnows: true });

    expect(on.readerKnows).toEqual([]);
    expect(on.hidden.map(fact => fact.factKey)).toEqual(['lamp_rank_4_rule']);
  });

  it('should tell the judge to flag the cast acting on what only the reader knows, and say nothing when there is none', () => {
    const fact = { factKey: 'lamp_rank_4_rule', text: 'The fourth rank costs a memory an hour.' };

    expect(renderJudgeReaderKnows([fact])).toContain(
      '- [lamp_rank_4_rule] The fourth rank costs a memory an hour.\n\nThe prose may let the reader feel these; flag any POV character',
    );
    expect(renderJudgeReaderKnows([])).toBe('');
  });
});

describe('reader disclosure without a knowledge contract', () => {
  const DATED = { factKey: 'tide_turns', text: 'The tide turns at the new moon.', revealChapter: 5 };

  function project(draft: boolean, briefs: Record<string, unknown>[]): Tables {
    const drafts = draft ? [{ chapter: 5, revision: 1, reviewStatus: 'approved' }] : [];
    return planTables({ facts: [DATED, { factKey: 'later_tide', text: 'The sea wall fails.', revealChapter: 9 }], briefs, drafts });
  }

  it('should disclose a dated fact whose reveal holds at the finalized chapter, and nothing scheduled later', async () => {
    const tables = project(true, [{ chapter: 5 }]);

    await finalize(tables, 1);

    expect(tables.fact('tide_turns')?.['disclosedInChapter']).toBe(5);
    expect(tables.fact('later_tide')?.['disclosedInChapter']).toBeNull();
  });

  it('should disclose on a finalize with no draft when the chapter has a plan', async () => {
    const tables = project(false, [{ chapter: 5 }]);

    await finalize(tables, 1, '');

    expect(tables.fact('tide_turns')?.['disclosedInChapter']).toBe(5);
  });

  it('should stamp neither open canon nor a dated fact an earlier chapter could already show', async () => {
    const tables = planTables({
      facts: [
        { factKey: 'lamp_law', text: 'Lamps burn memory.', revealChapter: 1 },
        { factKey: 'old_tide', text: 'The tide once turned at noon.', revealChapter: 3 },
      ],
      briefs: [{ chapter: 5 }],
      drafts: [{ chapter: 5, revision: 1, reviewStatus: 'approved' }],
    });

    await finalize(tables, 1);

    expect(tables.fact('lamp_law')?.['disclosedInChapter']).toBeNull();
    expect(tables.fact('old_tide')?.['disclosedInChapter']).toBeNull();
  });

  it('should disclose nothing on a finalize with no draft and no plan', async () => {
    const tables = project(false, []);

    await finalize(tables, 1, '');

    expect(tables.fact('tide_turns')?.['disclosedInChapter']).toBeNull();
  });
});
