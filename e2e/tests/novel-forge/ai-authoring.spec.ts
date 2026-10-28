import { type APIRequestContext } from '@playwright/test';

import { mutate, novelForgeDb } from '../../lib';
import { expect, test } from './forge-actors';
import { readProposalRow } from './forge-bible';
import {
  aiAvailable,
  aiSkipReason,
  approveChapter,
  CHAPTER_ONE,
  chatTurn,
  type CreatedNovel,
  createNovel,
  type Draft,
  expectStatus,
  finalizeThroughReview,
  MODEL_CALL_TIMEOUT_MS,
  MODEL_FLOW_TIMEOUT_MS,
  MODEL_TAG,
  NOVEL_NOTES,
  ORGANISABLE_NOTES,
  pollJobStatus,
  readDraft,
  saveChapter,
  settledChatJob,
  slowPost,
  startNextChapter,
  uniqueSuffix,
  useEconomyTier,
  writeChapterByHand,
} from './forge-helpers';

interface ChapterReview {
  kind: string;
  disposition: string;
  draftRevision?: number | null;
}

/**
 * The two authoring paths against a live model, on Economy-tier projects: a new novel (notes -> chat opener -> organise -> plan chapter 1 -> write -> approve -> finalize review
 * -> final) and a
 * hand-written chapter (write -> AI editorial review -> approve -> finalize review -> final). Assertions read structure only, never the model's wording. Opt-in (`E2E_LIVE_AI=1`)
 * and tagged `@model`.
 */

const OPENER = 'Organise my notes';
const CHAPTER_ONE_INTENT = 'Tamsin measures the street at dawn and sees a wall move while she watches.';
const PLAN_KIND = 'chapter_plan';

async function applyProposal(ctx: APIRequestContext, projectId: string, proposalId: string): Promise<void> {
  const applied = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
  await expectStatus(applied, 200, `applying proposal ${proposalId}`);
  expect((await readProposalRow(proposalId))?.status, `proposal ${proposalId} was applied`).toBe('applied');
}

/** Every text model call a project made ran on the model its group routes to on the Economy tier; read before the fixture deletes the project and its calls. The routes are admin-only. */
async function expectEconomyRouting(ctx: APIRequestContext, projectId: string): Promise<void> {
  const routes = (await (await ctx.get(`/api/v1/projects/${projectId}/ai/models?costTier=economy&contentMode=standard`)).json()) as {
    models: { group: string; provider: string; model: string }[];
  };
  const economy = new Set(routes.models.map(route => `${route.provider}::${route.model}`));
  const rows = await novelForgeDb()<{ role: string; provider: string; model: string }[]>`
    SELECT DISTINCT role, provider, model FROM model_calls WHERE project_id = ${projectId}::bigint AND model NOT ILIKE '%embed%'
  `;
  expect(rows.length, 'expected at least one recorded model call').toBeGreaterThan(0);
  for (const row of rows) expect(economy.has(`${row.provider}::${row.model}`), `role ${row.role} ran on ${row.model}`).toBe(true);
}

/** Finalize refuses a standard chapter without a summary, and a generated draft may not carry one; a hand save adds it before approval. */
async function withSummary(ctx: APIRequestContext, projectId: string, draft: Draft): Promise<Draft> {
  if (draft.summary?.trim()) return draft;
  return saveChapter(ctx, projectId, draft, { title: draft.title ?? undefined, body: draft.body ?? '', summary: 'Chapter one, as written by the model for the e2e run.' });
}

test.describe('novel-forge AI authoring', { tag: MODEL_TAG }, () => {
  test.describe.configure({ mode: 'serial' });

  let available = false;

  test.beforeAll(async () => {
    test.setTimeout(MODEL_CALL_TIMEOUT_MS);
    available = await aiAvailable('user1');
  });

  test.beforeEach(() => {
    test.skip(!available, aiSkipReason());
    test.setTimeout(MODEL_FLOW_TIMEOUT_MS);
  });

  test('should take a new novel from notes through chat, organise, plan and write to a final chapter', async ({ forge }) => {
    const { ctx } = await forge.actor({ label: 'ai-novel', roles: ['NovelForgeAdmin'] });
    const novel: CreatedNovel = await createNovel(ctx, { title: `E2E AI Novel ${uniqueSuffix()}`, notes: ORGANISABLE_NOTES });
    await useEconomyTier(ctx, novel.projectId);

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
      const turn = await chatTurn(ctx, novel, `Plan chapter 1: ${CHAPTER_ONE_INTENT}`);
      const planAction = turn.messages.filter(message => message.role === 'assistant').at(-1)?.proposalId;
      if (planAction) await applyProposal(ctx, novel.projectId, planAction);
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
      await expectStatus(await approveChapter(ctx, novel.projectId, draft), 200, 'approving chapter 1');

      const review = await finalizeThroughReview(ctx, novel.projectId, 1);
      expect(review.status).toBe('applied');
      expect((await readDraft(ctx, novel.projectId, 1)).status).toBe('final');
      expect((await startNextChapter(ctx, novel.projectId)).chapter).toBe(2);
    });

    await test.step('route every text model call to an Economy-tier model', () => expectEconomyRouting(ctx, novel.projectId));
  });

  test('should review a hand-written chapter with AI and finalize it', async ({ forge }) => {
    const { ctx } = await forge.actor({ label: 'ai-review', roles: ['NovelForgeAdmin'] });
    const { projectId } = await createNovel(ctx, { title: `E2E AI Review ${uniqueSuffix()}`, notes: NOVEL_NOTES });
    await useEconomyTier(ctx, projectId);
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
      await expectStatus(await approveChapter(ctx, projectId, await readDraft(ctx, projectId, 1)), 200, 'approving chapter 1');

      const review = await finalizeThroughReview(ctx, projectId, 1);
      expect(review.status).toBe('applied');
      expect((await readDraft(ctx, projectId, 1)).status).toBe('final');
    });

    await test.step('route every text model call to an Economy-tier model', () => expectEconomyRouting(ctx, projectId));
  });
});
