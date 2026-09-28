/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, novelForgeDb } from '../../lib';
import { readProposalRow } from './forge-bible';
import {
  aiAvailable,
  aiSkipReason,
  approveChapter,
  CHAPTER_ONE,
  chatTurn,
  type CreatedNovel,
  createNovel,
  deleteProjectQuietly,
  type Draft,
  expectCommittedDespiteSerializerBug,
  finalizeThroughReview,
  HAIKU_MODEL,
  MODEL_FLOW_TIMEOUT_MS,
  MODEL_TAG,
  NOVEL_NOTES,
  pinHaiku,
  pollJobStatus,
  readDraft,
  saveChapter,
  settledChatJob,
  slowPost,
  startNextChapter,
  uniqueSuffix,
  writeChapterByHand,
} from './forge-helpers';

/**
 * Defining types
 */

interface ChapterReview {
  kind: string;
  disposition: string;
  draftRevision?: number | null;
}

/**
 * Declaring the constants
 *
 * The two authoring paths end to end against a live model, on Haiku-pinned projects:
 *   - a new novel: notes → chat opener → organise → plan chapter 1 → write it → approve → finalize review → final;
 *   - a hand-written chapter: write → an AI editorial review → approve → finalize review → final.
 * Assertions read structure only — a job settled `done`, a card was staged and applied, a draft has prose, a review settled — never
 * the model's wording. Opt-in (`E2E_LIVE_AI=1`) and tagged `@model`.
 */

const OPENER = 'Organise my notes and ask me about the rest';
const CHAPTER_ONE_INTENT = 'Tamsin measures the street at dawn and sees a wall move while she watches.';
const PLAN_KIND = 'chapter_plan';

async function applyProposal(ctx: APIRequestContext, projectId: string, proposalId: string): Promise<void> {
  const applied = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
  await expectCommittedDespiteSerializerBug(applied, 200, `applying proposal ${proposalId}`);
  expect((await readProposalRow(proposalId))?.status, `proposal ${proposalId} was applied`).toBe('applied');
}

/** Finalize refuses a standard chapter without a summary, and a generated draft may not carry one; a hand save adds it before approval. */
async function withSummary(ctx: APIRequestContext, projectId: string, draft: Draft): Promise<Draft> {
  if (draft.summary?.trim()) return draft;
  return saveChapter(ctx, projectId, draft, { title: draft.title ?? undefined, body: draft.body ?? '', summary: 'Chapter one, as written by the model for the e2e run.' });
}

test.describe('novel-forge AI authoring', { tag: MODEL_TAG }, () => {
  test.describe.configure({ mode: 'serial' });

  let available = false;
  let ctx: APIRequestContext;
  const created: string[] = [];

  test.beforeAll(async () => {
    available = await aiAvailable('user1');
    ctx = await apiContext('novelForge', 'user1');
  });

  test.afterAll(async () => {
    for (const projectId of created) await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
  });

  test.beforeEach(() => {
    test.skip(!available, aiSkipReason());
    test.setTimeout(MODEL_FLOW_TIMEOUT_MS);
  });

  test('should take a new novel from notes through chat, organise, plan and write to a final chapter', async () => {
    const novel: CreatedNovel = await createNovel(ctx, { title: `E2E AI Novel ${uniqueSuffix()}`, notes: NOVEL_NOTES });
    created.push(novel.projectId);
    await pinHaiku(ctx, novel.projectId);

    await test.step('organise the notes from the chat opener', async () => {
      const transcript = await chatTurn(ctx, novel, OPENER);
      expect(
        transcript.messages
          .filter(message => message.role === 'assistant')
          .at(-1)
          ?.content.trim().length ?? 0,
      ).toBeGreaterThan(0);

      const organise = await settledChatJob(ctx, novel, 'organise');
      expect(organise?.status, organise?.lastError ?? '').toBe('done');
      expect(organise?.progress?.appliedProposalId ?? organise?.progress?.proposalId, 'organise should apply or stage something from the notes').toBeTruthy();
      if (organise?.progress?.proposalId) await applyProposal(ctx, novel.projectId, organise.progress.proposalId);
    });

    await test.step('plan chapter 1 and apply the plan card', async () => {
      await chatTurn(ctx, novel, `Plan chapter 1: ${CHAPTER_ONE_INTENT}`);
      const plan = await settledChatJob(ctx, novel, 'plan');
      expect(plan?.status, plan?.lastError ?? '').toBe('done');
      const proposalId = plan?.progress?.proposalId ?? '';
      expect(proposalId, 'the plan job should stage a plan card').toBeTruthy();

      const card = (await (await ctx.get(`/api/v1/projects/${novel.projectId}/proposals/${proposalId}`)).json()) as { kind: string; status: string };
      expect(card.kind).toBe(PLAN_KIND);
      await applyProposal(ctx, novel.projectId, proposalId);

      const briefs = (await (await ctx.get(`/api/v1/projects/${novel.projectId}/briefs`)).json()) as { items: { chapter: number }[] };
      expect(briefs.items.map(item => item.chapter)).toContain(1);
    });

    await test.step('write chapter 1 from its plan', async () => {
      const write = await slowPost(ctx, `/api/v1/projects/${novel.projectId}/generate`, { limit: 1 });
      expect(write.status(), await write.text()).toBe(202);
      const { jobId } = (await write.json()) as { jobId: string };
      const job = await pollJobStatus(jobId, MODEL_FLOW_TIMEOUT_MS / 2);
      expect(job.status, job.lastError ?? '').toBe('done');

      const draft = await readDraft(ctx, novel.projectId, 1);
      expect(draft.body?.trim().length ?? 0).toBeGreaterThan(300);
    });

    await test.step('approve chapter 1 and finalize it through its Story Bible review', async () => {
      const draft = await withSummary(ctx, novel.projectId, await readDraft(ctx, novel.projectId, 1));
      await expectCommittedDespiteSerializerBug(await approveChapter(ctx, novel.projectId, draft), 200, 'approving chapter 1');

      const review = await finalizeThroughReview(ctx, novel.projectId, 1);
      expect(review.status).toBe('applied');
      expect((await readDraft(ctx, novel.projectId, 1)).status).toBe('final');
      expect((await startNextChapter(ctx, novel.projectId)).chapter).toBe(2);
    });
  });

  test('should review a hand-written chapter with AI and finalize it', async () => {
    const { projectId } = await createNovel(ctx, { title: `E2E AI Review ${uniqueSuffix()}`, notes: NOVEL_NOTES });
    created.push(projectId);
    await pinHaiku(ctx, projectId);
    const draft = await writeChapterByHand(ctx, projectId, CHAPTER_ONE);

    await test.step('run an editorial review of the revision written', async () => {
      const run = await slowPost(ctx, `/api/v1/projects/${projectId}/chapters/1/reviews`, { kind: 'editorial' });
      expect([201, 202], await run.text()).toContain(run.status());
      if (run.status() === 202) {
        const { jobId } = (await run.json()) as { jobId: string };
        const job = await pollJobStatus(jobId, MODEL_FLOW_TIMEOUT_MS / 2);
        expect(job.status, job.lastError ?? '').toBe('done');
      }

      const listed = (await (await ctx.get(`/api/v1/projects/${projectId}/chapters/1/reviews`)).json()) as { latest: ChapterReview[] };
      const editorial = listed.latest.find(review => review.kind === 'editorial');
      expect(editorial?.draftRevision).toBe(draft.revision);
      expect(editorial?.disposition).not.toBe('failed');
    });

    await test.step('approve and finalize through the Story Bible review', async () => {
      await expectCommittedDespiteSerializerBug(await approveChapter(ctx, projectId, await readDraft(ctx, projectId, 1)), 200, 'approving chapter 1');

      const review = await finalizeThroughReview(ctx, projectId, 1);
      expect(review.status).toBe('applied');
      expect((await readDraft(ctx, projectId, 1)).status).toBe('final');
    });
  });

  test('should have routed every text model call of these runs to the pinned Haiku model', async () => {
    expect(created.length, 'the authoring tests above must have run').toBeGreaterThan(0);
    const rows = await novelForgeDb()<{ role: string; provider: string; model: string }[]>`
      SELECT DISTINCT role, provider, model FROM model_calls WHERE project_id = ANY(${created}::bigint[]) AND model NOT ILIKE '%embed%'
    `;
    expect(rows.length, 'expected at least one recorded model call').toBeGreaterThan(0);
    for (const row of rows) expect({ provider: row.provider, model: row.model }, `role ${row.role}`).toEqual(HAIKU_MODEL);
  });
});
