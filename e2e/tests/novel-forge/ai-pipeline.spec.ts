/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, novelForgeDb, pollJob } from '../../lib';
import { AI_SKIP_REASON, aiAvailable, createProject, deleteProjectQuietly, pinHaiku, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * One compact end-to-end authoring arc on a fresh Haiku-pinned project: seed → plan → approve → outline →
 * generate → judge → approve → finalize, keeping the total AI calls small (~8). Serial and generously
 * timed, because the dev gateway serialises AI work at concurrency 1 with a 5-minute per-call ceiling. The
 * whole describe skips when the gateway probe reports no usable Anthropic key. A closing check reads the
 * `model_calls` ledger straight from the DB to prove every call actually used anthropic/claude-haiku-4-5.
 */

test.describe.configure({ mode: 'serial' });

const BRIEF = 'A lighthouse keeper discovers the light summons sea spirits. Short cozy fantasy.';

/** A CSRF-authenticated POST with a 10-minute timeout — long enough for a synchronous Haiku authoring call. */
async function aiPost(ctx: APIRequestContext, url: string, data?: unknown): Promise<APIResponse> {
  await ctx.get('/api/auth/session');
  const { cookies } = await ctx.storageState();
  const token = cookies.find(c => c.name === 'csrf-token')?.value.split(':')[1];
  return ctx.post(url, { headers: token ? { 'x-csrf-token': token } : {}, timeout: 600_000, ...(data === undefined ? {} : { data }) });
}

test.describe('novel-forge Haiku authoring pipeline', () => {
  let ctx: APIRequestContext;
  let projectId: string;
  let available = false;

  test.beforeAll(async () => {
    available = await aiAvailable('user1');
    if (!available) return;
    ctx = await apiContext('novelForge', 'user1');
    const { id } = await createProject(ctx, { name: `e2e-forge-ai-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });
    projectId = id;
    await pinHaiku(ctx, projectId);
    await mutate(ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { brief: BRIEF } });
  });

  test.afterAll(async () => {
    if (projectId) await deleteProjectQuietly(ctx, projectId);
    await ctx?.dispose();
  });

  test.beforeEach(() => {
    test.skip(!available, AI_SKIP_REASON);
    test.setTimeout(600_000);
  });

  test('should seed the story bible and entities from a brief', async () => {
    const seed = await aiPost(ctx, `/api/v1/projects/${projectId}/seed-from-brief`, { brief: BRIEF });
    expect(seed.status(), await seed.text()).toBe(200);

    const bible = await ctx.get(`/api/v1/projects/${projectId}/bible`);
    expect((await bible.json()).docs.length).toBeGreaterThan(0);
    const entities = await ctx.get(`/api/v1/projects/${projectId}/entities`);
    expect((await entities.json()).items.length).toBeGreaterThan(0);
  });

  test('should plan volumes and approve them', async () => {
    const plan = await aiPost(ctx, `/api/v1/projects/${projectId}/plan`, { volumeCount: 1, chaptersPerVolume: 2 });
    expect(plan.status(), await plan.text()).toBe(200);
    expect((await plan.json()).volumes.length).toBeGreaterThan(0);

    const approve = await aiPost(ctx, `/api/v1/projects/${projectId}/volumes/approve`);
    expect(approve.status()).toBe(200);
    expect((await approve.json()).approved).toBe(true);
  });

  test('should outline chapter briefs', async () => {
    const outline = await aiPost(ctx, `/api/v1/projects/${projectId}/outline`, { count: 1, start: 1 });
    expect(outline.status(), await outline.text()).toBe(200);

    const briefs = await ctx.get(`/api/v1/projects/${projectId}/briefs`);
    expect((await briefs.json()).items.length).toBeGreaterThan(0);
  });

  test('should generate a chapter draft with real prose', async () => {
    const generate = await aiPost(ctx, `/api/v1/projects/${projectId}/generate`, { limit: 1 });
    expect(generate.status(), await generate.text()).toBe(202);
    const { jobId } = (await generate.json()) as { jobId: string };
    const job = await pollJob<{ status: string; lastError?: string }>(ctx, jobId, { timeoutMs: 600_000 });
    expect(job.status, `generate job failed: ${job.lastError ?? ''}`).toBe('done');

    const draft = await ctx.get(`/api/v1/projects/${projectId}/drafts/1`);
    expect(draft.status()).toBe(200);
    expect(((await draft.json()).body as string).length).toBeGreaterThan(500);
  });

  test('should judge, approve, and finalize the chapter', async () => {
    const judge = await aiPost(ctx, `/api/v1/projects/${projectId}/drafts/1/judge`);
    expect(judge.status(), await judge.text()).toBe(200);
    expect((await judge.json()).verdict).toBeTruthy();

    const approve = await aiPost(ctx, `/api/v1/projects/${projectId}/drafts/1/approve`, {});
    expect(approve.status()).toBe(200);

    const finalize = await aiPost(ctx, `/api/v1/projects/${projectId}/finalize`, { chapter: 1 });
    expect(finalize.status(), await finalize.text()).toBe(200);
  });

  test('should have used only anthropic/claude-haiku-4-5 for every model call', async () => {
    const rows = await novelForgeDb()<{ provider: string; model: string }[]>`
      SELECT DISTINCT provider, model FROM model_calls WHERE project_id = ${projectId}
    `;
    expect(rows.length, 'expected at least one recorded model call').toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.provider).toBe('anthropic');
      expect(row.model).toBe('claude-haiku-4-5');
    }
  });
});
