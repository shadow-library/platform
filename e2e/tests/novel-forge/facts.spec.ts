/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { expect, test } from './forge-actors';
import { expectCode } from './forge-arrange';
import { assertSpendGuarded, listDispatchedModelCalls } from './forge-db';
import { approveChapter, createEntity, type Draft, readDraft, saveChapter, startNextChapter } from './forge-helpers';
import {
  approveAsRead,
  countKnowledge,
  createGuardedProject,
  type FactBody,
  putFact,
  readBriefStale,
  readFactRow,
  readKnowledge,
  readStaleDraft,
  readyFinalizeReview,
  writeBrief,
  writeFact,
} from './forge-story';

/**
 * Defining types
 */

interface KnowledgeEntry {
  readonly entityKey: string;
  readonly learnedInChapter: number;
  readonly source: string;
  readonly note: string | null;
  readonly status: string;
}

interface Fact extends Omit<FactBody, 'writerNote' | 'constraintNote'> {
  readonly factKey: string;
  readonly writerNote?: string | null;
  readonly constraintNote?: string | null;
  readonly plannedChapter?: number | null;
  readonly disclosedInChapter?: number | null;
  readonly knowledge: KnowledgeEntry[];
}

interface Milestone {
  readonly milestoneKey: string;
  readonly state: string;
  readonly plannedChapter?: number | null;
  readonly reachedChapter?: number | null;
}

/**
 * Declaring the constants
 *
 * Canon facts — the book's secrets — and the reveal ledger that says who in the story knows each one. A fact is written by hand and
 * merges what a write omits; the ledger is written by hand, by an approval (provisionally, bound to the approved revision) and by
 * finalize (committed). A fact change that breaks a plan's reveal never rewrites the plan: it marks the plan and its draft stale. Every
 * approval queues a finalize-review model call, so each project is quota-pinned and fail-pinned and the call fails without spending.
 */

const ORACLE = 'oracle_truth';

const ORACLE_TEXT = 'The oracle of the harbour is the regent in disguise.';

const FULL_FACT = {
  text: ORACLE_TEXT,
  subjects: ['mira'],
  constraintNote: 'Author only: the unmasking lands at the end of volume one.',
  writerNote: 'Let the oracle speak with a courtier’s cadence.',
  terms: ['regent in disguise'],
  revealChapter: 3,
  unlock: { all: [{ chapter: 2 }] },
  allowedClues: ['The oracle never appears when the regent is at court.'],
} satisfies FactBody;

function factPath(projectId: string, suffix = ''): string {
  return `/api/v1/projects/${projectId}/facts${suffix}`;
}

async function readFact(ctx: APIRequestContext, projectId: string, factKey: string): Promise<Fact> {
  const response = await ctx.get(factPath(projectId, `/${factKey}`));
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Fact;
}

function reveal(ctx: APIRequestContext, projectId: string, factKey: string, data: { entityKey: string; chapter: number; note?: string }): Promise<APIResponse> {
  return mutate(ctx, 'post', factPath(projectId, `/${factKey}/reveal`), { data });
}

async function readMilestone(ctx: APIRequestContext, projectId: string, milestoneKey: string): Promise<Milestone | undefined> {
  const response = await ctx.get(`/api/v1/projects/${projectId}/milestones`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { milestones: Milestone[] }).milestones.find(milestone => milestone.milestoneKey === milestoneKey);
}

async function writeChapterOne(ctx: APIRequestContext, projectId: string, body: string): Promise<Draft> {
  return saveChapter(ctx, projectId, await startNextChapter(ctx, projectId), { title: 'The Oath', body, summary: 'Mira swears the river oath.' });
}

test.describe('novel-forge canon facts', () => {
  test('should round-trip every field of a fact, keep what a write omits, clear a blank writer note and undate a fact on null', async ({ forge }) => {
    const owner = await forge.actor({ label: 'facts-fields' });
    const projectId = await createGuardedProject(forge, owner, 'facts-fields');
    await createEntity(owner.ctx, projectId, { entityKey: 'mira', name: 'Mira' });

    const created = await putFact(owner.ctx, projectId, ORACLE, FULL_FACT);
    expect(created.status(), await created.text()).toBe(200);
    expect(await created.json()).toMatchObject({ factKey: ORACLE, ...FULL_FACT, knowledge: [] });

    const retold = 'The harbour oracle is the regent wearing a mask.';
    const merged = await putFact(owner.ctx, projectId, ORACLE, { text: retold });
    expect(merged.status(), await merged.text()).toBe(200);
    expect(await merged.json(), 'a write keeps every field it omits').toMatchObject({ ...FULL_FACT, text: retold });

    await writeFact(owner.ctx, projectId, ORACLE, { text: retold, writerNote: '  ', revealChapter: null, unlock: null, allowedClues: null });
    const cleared = await readFact(owner.ctx, projectId, ORACLE);
    expect(cleared.writerNote ?? null, 'a blank writer note clears it and withholds the fact entirely').toBeNull();
    expect(cleared.revealChapter ?? null, 'null undates the fact').toBeNull();
    expect(cleared.unlock, 'and clears its condition').toBeUndefined();
    expect(cleared.allowedClues ?? null).toBeNull();
    expect(cleared, 'the rest stays').toMatchObject({ constraintNote: FULL_FACT.constraintNote, terms: FULL_FACT.terms, subjects: FULL_FACT.subjects });

    const malformed = await putFact(owner.ctx, projectId, ORACLE, { text: retold, unlock: { all: [{ ending: false } as never] } });
    await expectCode(malformed, 400, 'FCT_005', 'an ending term that is not true');
    expect((await readFact(owner.ctx, projectId, ORACLE)).unlock, 'the refused condition was not stored').toBeUndefined();

    const listed = await owner.ctx.get(factPath(projectId));
    expect(listed.status(), await listed.text()).toBe(200);
    expect(((await listed.json()) as { facts: Fact[] }).facts.map(fact => fact.factKey)).toEqual([ORACLE]);
  });

  test('should ledger, correct and retract who learned a fact, and delete a fact together with its ledger', async ({ forge }) => {
    const owner = await forge.actor({ label: 'facts-ledger' });
    const projectId = await createGuardedProject(forge, owner, 'facts-ledger');
    await createEntity(owner.ctx, projectId, { entityKey: 'mira', name: 'Mira' });
    await createEntity(owner.ctx, projectId, { entityKey: 'kel', name: 'Kel' });
    await writeFact(owner.ctx, projectId, ORACLE, { text: ORACLE_TEXT, revealChapter: 3 });

    expect((await reveal(owner.ctx, projectId, ORACLE, { entityKey: 'mira', chapter: 2, note: 'overheard at the shrine' })).status()).toBe(200);
    const corrected = await reveal(owner.ctx, projectId, ORACLE, { entityKey: 'mira', chapter: 4, note: 'read it in the ledger' });
    expect(corrected.status(), await corrected.text()).toBe(200);
    expect(((await corrected.json()) as Fact).knowledge, 'a second reveal corrects the entry rather than adding one').toEqual([
      expect.objectContaining({ entityKey: 'mira', learnedInChapter: 4, source: 'manual', note: 'read it in the ledger', status: 'committed' }),
    ]);
    expect((await reveal(owner.ctx, projectId, ORACLE, { entityKey: 'kel', chapter: 3 })).status()).toBe(200);
    expect((await readFact(owner.ctx, projectId, ORACLE)).knowledge.map(entry => [entry.entityKey, entry.learnedInChapter])).toEqual([
      ['kel', 3],
      ['mira', 4],
    ]);

    const retracted = await mutate(owner.ctx, 'delete', factPath(projectId, `/${ORACLE}/knowledge/kel`));
    expect(retracted.status(), await retracted.text()).toBe(200);
    expect(((await retracted.json()) as Fact).knowledge.map(entry => entry.entityKey)).toEqual(['mira']);

    await expectCode(await reveal(owner.ctx, projectId, 'no_such_fact', { entityKey: 'mira', chapter: 1 }), 404, 'FCT_001', 'revealing an unknown fact');
    await expectCode(await reveal(owner.ctx, projectId, ORACLE, { entityKey: 'ghost', chapter: 1 }), 400, 'FCT_002', 'revealing to an unknown entity');
    await expectCode(await mutate(owner.ctx, 'delete', factPath(projectId, '/no_such_fact/knowledge/mira')), 404, 'FCT_001', 'retracting from an unknown fact');
    expect((await readFact(owner.ctx, projectId, ORACLE)).knowledge, 'refusals leave the ledger alone').toHaveLength(1);

    // apps/novel-forge-web/src/routes/novels/$novelId/story-bible.tsx:732 warns this removes "everything recorded about who learns it"; FCT_003
    // guards only the revertible change-set op.
    const deleted = await mutate(owner.ctx, 'delete', factPath(projectId, `/${ORACLE}`));
    expect(deleted.status(), await deleted.text()).toBe(204);
    expect(await countKnowledge(projectId), 'the ledger went with the fact').toBe(0);
    await expectCode(await owner.ctx.get(factPath(projectId, `/${ORACLE}`)), 404, 'FCT_001', 'reading a deleted fact');
    await expectCode(await mutate(owner.ctx, 'delete', factPath(projectId, `/${ORACLE}`)), 404, 'FCT_001', 'deleting it twice');

    await writeFact(owner.ctx, projectId, ORACLE, { text: ORACLE_TEXT });
    expect((await readFact(owner.ctx, projectId, ORACLE)).knowledge, 'the key is free to write again, with no ledger').toEqual([]);
  });

  test("should mark a plan and its draft stale when a fact change breaks the plan's reveal, refuse approving it as written, and lift the mark once it holds", async ({ forge }) => {
    const owner = await forge.actor({ label: 'facts-stale' });
    const projectId = await createGuardedProject(forge, owner, 'facts-stale');
    await createEntity(owner.ctx, projectId, { entityKey: 'mira', name: 'Mira' });
    await writeFact(owner.ctx, projectId, ORACLE, { text: ORACLE_TEXT, revealChapter: 1 });
    await writeBrief(owner.ctx, projectId, 1, {
      body: 'Mira unmasks the oracle.',
      pov: 'mira',
      knowledgeContract: { pov: ['mira'], learns: [{ entityKey: 'mira', factKey: ORACLE }] },
    });
    const draft = await approveAsRead(owner.ctx, projectId, await writeChapterOne(owner.ctx, projectId, 'Mira tore the mask from the oracle.'));
    expect(await readKnowledge(projectId, ORACLE), 'the approval ledgered the reveal').toEqual([expect.objectContaining({ entityKey: 'mira', status: 'provisional' })]);

    await writeFact(owner.ctx, projectId, ORACLE, { text: ORACLE_TEXT, revealChapter: 3 });
    const planStale = await readBriefStale(projectId, 1);
    expect(planStale, 'the plan is marked, not rewritten').toMatch(/^a reveal in this plan no longer holds: oracle_truth/);
    const stale = await readStaleDraft(owner.ctx, projectId, 1);
    expect(stale.staleReason).toBe(planStale);
    expect(stale.reviewStatus, 'its approval is revoked').toBe('needs_review');
    expect(await readKnowledge(projectId, ORACLE), 'with the reveal it ledgered').toEqual([]);

    await assertSpendGuarded(projectId);
    await expectCode(await approveChapter(owner.ctx, projectId, stale), 400, 'DRF_007', 'approving a stale draft');
    const asWritten = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/drafts/1/approve`, {
      data: { revision: stale.revision, saveSeq: stale.saveSeq, draftId: stale.id, keepStale: true, staleReason: stale.staleReason },
    });
    await expectCode(asWritten, 400, 'DRF_017', 'approving as written over a reveal that no longer holds');

    await writeFact(owner.ctx, projectId, ORACLE, { text: ORACLE_TEXT, revealChapter: 1 });
    expect(await readBriefStale(projectId, 1), 'the reconcile lifts its own mark').toBeNull();
    const fresh = await readStaleDraft(owner.ctx, projectId, 1);
    expect(fresh.staleReason).toBeNull();
    expect((await approveAsRead(owner.ctx, projectId, fresh)).revision).toBe(draft.revision);
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });
});

test.describe('novel-forge reveal ledger across approval and finalize', () => {
  test('should ledger an approved plan’s reveals provisionally, revoke them with the approval, and commit them, the disclosure and the milestone at finalize', async ({
    forge,
  }) => {
    const owner = await forge.actor({ label: 'facts-finalize' });
    const projectId = await createGuardedProject(forge, owner, 'facts-finalize');
    await createEntity(owner.ctx, projectId, { entityKey: 'mira', name: 'Mira' });
    await writeFact(owner.ctx, projectId, ORACLE, { text: ORACLE_TEXT, revealChapter: null, unlock: { all: [{ milestone: 'oath_sworn' }] } });
    const milestone = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/milestones`, { data: { milestoneKey: 'oath_sworn', label: 'Mira swears the oath' } });
    expect(milestone.status(), await milestone.text()).toBe(201);
    await writeBrief(owner.ctx, projectId, 1, {
      body: 'Mira swears the oath and sees the oracle unmasked.',
      pov: 'mira',
      claimedMilestones: ['oath_sworn'],
      knowledgeContract: {
        pov: ['mira'],
        learns: [
          { entityKey: 'mira', factKey: ORACLE },
          { entityKey: 'ghost', factKey: ORACLE },
          { entityKey: 'mira', factKey: 'no_such_fact' },
        ],
      },
    });
    expect(await readMilestone(owner.ctx, projectId, 'oath_sworn'), 'a claiming plan makes the milestone planned').toMatchObject({ state: 'planned', plannedChapter: 1 });

    const first = await approveAsRead(owner.ctx, projectId, await writeChapterOne(owner.ctx, projectId, 'Mira swore the oath on the river stones.'));
    const provisional = [{ entityKey: 'mira', learnedInChapter: 1, source: 'brief', status: 'provisional', draftRevision: first.revision }];
    expect(await readKnowledge(projectId, ORACLE), 'the approval ledgers what the plan teaches, skipping keys it cannot resolve').toEqual(provisional);
    expect(await countKnowledge(projectId)).toBe(1);
    await approveAsRead(owner.ctx, projectId, first);
    expect(await readKnowledge(projectId, ORACLE), 're-approving the same revision changes nothing').toEqual(provisional);

    const edited = await saveChapter(owner.ctx, projectId, first, { title: 'The Oath', body: 'Mira swore the oath on the cold river stones.', summary: 'Mira swears.' });
    expect(edited.reviewStatus, 'an edit revokes the approval').not.toBe('approved');
    expect(await readKnowledge(projectId, ORACLE), 'and the reveals it ledgered').toEqual([]);
    expect((await readFactRow(projectId, ORACLE))?.disclosedInChapter ?? null, 'planning never discloses').toBeNull();

    const second = await approveAsRead(owner.ctx, projectId, edited);
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(await readKnowledge(projectId, ORACLE), 'a new approval binds the new revision').toEqual([{ ...provisional[0], draftRevision: second.revision }]);
    expect((await readMilestone(owner.ctx, projectId, 'oath_sworn'))?.state, 'approval never reaches a milestone').toBe('planned');

    await readyFinalizeReview(projectId, second, [
      {
        category: 'milestone',
        subjectKey: 'oath_sworn',
        claim: 'Reached: Mira swears the oath',
        proposed: { category: 'milestone', milestoneKey: 'oath_sworn', reached: true },
        decision: 'kept',
      },
    ]);
    await assertSpendGuarded(projectId);
    const finalized = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/drafts/1/finalize-review/finalize`, { data: {} });
    expect(finalized.status(), await finalized.text()).toBe(200);
    expect(await readDraft(owner.ctx, projectId, 1)).toMatchObject({ status: 'final', revision: second.revision });
    expect(await readKnowledge(projectId, ORACLE), 'finalize commits the knowledge bound to the finalized revision').toEqual([
      { ...provisional[0], draftRevision: second.revision, status: 'committed' },
    ]);
    expect((await readFactRow(projectId, ORACLE))?.disclosedInChapter, 'and discloses the reveal to the reader').toBe(1);
    expect(await readMilestone(owner.ctx, projectId, 'oath_sworn'), 'and reaches the milestone the review kept').toMatchObject({ state: 'reached', reachedChapter: 1 });
    expect(await listDispatchedModelCalls(projectId), 'the review path finalizes without a model call').toEqual([]);
  });
});

test.describe('novel-forge story API responses', () => {
  test('should answer an approval with the approved draft', async ({ forge }) => {
    const owner = await forge.actor({ label: 'facts-approve' });
    const projectId = await createGuardedProject(forge, owner, 'facts-approve');
    const draft = await writeChapterOne(owner.ctx, projectId, 'Mira swore the oath on the river stones.');

    await assertSpendGuarded(projectId);
    const approved = await approveChapter(owner.ctx, projectId, draft);
    expect(approved.status(), await approved.text()).toBe(200);
    expect(await approved.json()).toMatchObject({ id: draft.id, reviewStatus: 'approved', approvedRevision: draft.revision, overriddenFindings: 0 });
  });

  // generation.dto.ts:597 — BriefResponse has no knowledgeContract field, so a plan's contract is write-only through the API, though
  // docs/novel-forge/ai-testing.md:993 expects `GET /briefs/:n` to echo it back.
  test.fixme("should read a plan's knowledge contract back from the plan", async ({ forge }) => {
    const owner = await forge.actor({ label: 'facts-brief' });
    const projectId = await createGuardedProject(forge, owner, 'facts-brief');
    await createEntity(owner.ctx, projectId, { entityKey: 'mira', name: 'Mira' });
    const knowledgeContract = { pov: ['mira'], learns: [] };
    await writeBrief(owner.ctx, projectId, 2, { body: 'Mira keeps her silence.', pov: 'mira', knowledgeContract });

    const stored = await owner.ctx.get(`/api/v1/projects/${projectId}/briefs/2`);
    expect(stored.status(), await stored.text()).toBe(200);
    expect(await stored.json()).toMatchObject({ knowledgeContract });
  });
});
