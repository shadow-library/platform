/**
 * End-to-end authoring flow: create a project, brief it, plan + approve volumes, generate chapters
 * through the real backend/model stack, run continuity validation, and read the assembled manuscript.
 *
 * This exercises the live AI pipeline (local Ollama by default), so it is slow and opt-in — it is
 * skipped unless `E2E_FULL=1`. It needs the dev stack running: the backend on :8080, Ollama with the
 * configured models, and the web app on :3000 (the Playwright webServer reuses a running dev server).
 *
 * Tunables (env):
 *   E2E_FULL=1            enable this suite (otherwise skipped)
 *   E2E_CHAPTERS=2        number of chapters to plan + generate
 *   E2E_VOLUMES=1         number of volumes to plan (chapters are split across them)
 *   E2E_SEED_BIBLE=1      also run the (slow) bible builder before planning
 *   E2E_JUDGE_CODEX=1     route the continuity judge to the Codex CLI (needs it enabled + authed)
 *   E2E_STEP_TIMEOUT_MS   per-async-step budget (default 900000 = 15 min)
 *
 * Example:
 *   E2E_FULL=1 E2E_CHAPTERS=3 bunx playwright test tests/novel-e2e.spec.ts
 */
import { type APIRequestContext, type Page, expect, test } from '@playwright/test';

// Playwright specs run under Node; the app tsconfig only ships browser globals, so declare what we use.
declare const process: { env: Record<string, string | undefined> };

const ENABLED = process.env.E2E_FULL === '1';
const CHAPTERS = Math.max(1, Number(process.env.E2E_CHAPTERS ?? 2));
const VOLUMES = Math.max(1, Number(process.env.E2E_VOLUMES ?? 1));
const CHAPTERS_PER_VOLUME = Math.ceil(CHAPTERS / VOLUMES);
const SEED_BIBLE = process.env.E2E_SEED_BIBLE === '1';
const JUDGE_CODEX = process.env.E2E_JUDGE_CODEX === '1';
const STEP_TIMEOUT = Number(process.env.E2E_STEP_TIMEOUT_MS ?? 15 * 60 * 1000);
const NOVEL_NAME = process.env.E2E_NOVEL_NAME ?? `E2E Novel ${Date.now()}`;

const BRIEF =
  process.env.E2E_BRIEF ??
  'A retelling of the life of Vlad "Dracula", from a boyar\'s son held hostage in the Ottoman court, to a ruthless ' +
    'voivode of Wallachia who wages a shadow war for his throne, to the folklore that turns him into an immortal count. ' +
    'Torn between the boy who wanted to protect his people and the monster the world needed him to become, Vlad must ' +
    'decide how much of his humanity he will trade for power, and what legend he leaves behind.';

/** Polls a predicate against the backend until it holds or the budget is exhausted. */
async function pollUntil<T>(request: APIRequestContext, path: string, ready: (body: T) => boolean, label: string): Promise<T> {
  const deadline = Date.now() + STEP_TIMEOUT;
  let last: unknown;
  while (Date.now() < deadline) {
    const res = await request.get(path);
    if (res.ok()) {
      const body = (await res.json()) as T;
      last = body;
      if (ready(body)) return body;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`Timed out after ${STEP_TIMEOUT}ms waiting for ${label}. Last response: ${JSON.stringify(last).slice(0, 400)}`);
}

async function saveTab(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save changes' }).click();
}

test.describe('Author workflow — end to end', () => {
  test.skip(!ENABLED, 'Set E2E_FULL=1 to run the live end-to-end generation suite.');
  test.describe.configure({ mode: 'serial' });

  // The whole novel is built in one long test so state flows between phases.
  test('build a novel from premise to chapters, in order', async ({ page, request }) => {
    test.setTimeout(STEP_TIMEOUT * (CHAPTERS + 4));
    let novelId = '';

    await test.step('create the project', async () => {
      // Project names are unique, so clear any leftover with this name to keep fixed-name runs repeatable.
      const existing = await request.get('/api/v1/projects', { params: { limit: 100 } });
      if (existing.ok()) {
        const items = ((await existing.json()).items ?? []) as { id: string; name: string }[];
        for (const p of items.filter(p => p.name === NOVEL_NAME)) await request.delete(`/api/v1/projects/${p.id}`);
      }
      await page.goto('/');
      await page.locator('button[data-variant="primary"]', { hasText: 'New project' }).click();
      await page.getByRole('textbox', { name: 'Working title' }).fill(NOVEL_NAME);
      await page.getByRole('button', { name: 'Create novel' }).click();
      await page.waitForURL(/\/novels\/\d+\/overview/, { timeout: 30_000 });
      novelId = page.url().match(/\/novels\/(\d+)\//)?.[1] ?? '';
      expect(novelId).toBeTruthy();
    });

    await test.step('add the premise / brief', async () => {
      await page.goto(`/novels/${novelId}/settings`);
      await page.getByRole('textbox', { name: 'Premise / brief' }).fill(BRIEF);
      await saveTab(page);
      await expect.poll(async () => (await (await request.get(`/api/v1/projects/${novelId}`)).json()).brief, { timeout: 15_000 }).toContain(BRIEF.slice(0, 24));
    });

    if (JUDGE_CODEX) {
      await test.step('route the judge to Codex', async () => {
        await page.getByRole('tab', { name: 'Models' }).click();
        const judge = page.locator('div', { hasText: 'Continuity judge' }).locator('[role="combobox"]').last();
        await judge.click();
        await page.locator('[role="option"]', { hasText: 'Codex (CLI)' }).click();
        await saveTab(page);
        await expect.poll(async () => (await (await request.get(`/api/v1/projects/${novelId}`)).json())?.config?.models?.judge?.provider, { timeout: 15_000 }).toBe('openai-codex');
      });
    }

    if (SEED_BIBLE) {
      await test.step('generate the story bible', async () => {
        await page.goto(`/novels/${novelId}/story-bible`);
        await page.getByRole('button', { name: 'Generate story bible' }).click();
        await pollUntil<{ items: unknown[] }>(request, `/api/v1/projects/${novelId}/entities`, b => b.items.length > 0, 'bible entities');
      });
    }

    await test.step('plan and approve the volumes', async () => {
      await page.goto(`/novels/${novelId}/volumes`);
      await page.getByRole('button', { name: 'Generate volume plan' }).click();
      await page.getByRole('spinbutton', { name: 'Volumes' }).fill(String(VOLUMES));
      await page.getByRole('spinbutton', { name: 'Chapters per volume' }).fill(String(CHAPTERS_PER_VOLUME));
      await page.getByRole('button', { name: 'Generate plan' }).click();
      await pollUntil<{ items: unknown[] }>(request, `/api/v1/projects/${novelId}/volumes`, b => b.items.length >= VOLUMES, 'planned volumes');
      await page.reload();
      await page.getByRole('button', { name: 'Approve plan' }).click();
      await pollUntil<{ planApproved: boolean }>(request, `/api/v1/projects/${novelId}/status`, b => b.planApproved === true, 'plan approval');
    });

    await test.step('generate the chapter briefs (outline)', async () => {
      // Chapter generation only fills chapters that have a brief, so the outline must run first.
      await page.getByRole('button', { name: 'Generate briefs' }).click();
      await pollUntil<{ chapter?: number }>(request, `/api/v1/projects/${novelId}/briefs/1`, b => b.chapter === 1, 'chapter-1 brief');
    });

    let firstChapter = 1;
    await test.step('generate the chapters', async () => {
      await page.goto(`/novels/${novelId}/chapters`);
      await expect(page.getByRole('heading', { level: 1, name: 'Chapters' })).toBeVisible();
      // One batch enqueues the whole run; the backend drafts chapters strictly in order (a single
      // generation stream at a time), so we poll until every draft lands with prose.
      await request.post(`/api/v1/projects/${novelId}/generate`, { data: { limit: CHAPTERS } });
      const drafts = await pollUntil<{ items: { chapter: number; body?: string }[] }>(
        request,
        `/api/v1/projects/${novelId}/drafts`,
        b => b.items.length >= CHAPTERS && b.items.every(d => (d.body ?? '').trim().length > 0),
        `${CHAPTERS} generated chapters`,
      );
      expect(drafts.items.length).toBeGreaterThanOrEqual(CHAPTERS);

      // Sequential ordering: chapters must be drafted contiguously from chapter 1 — no gaps, no skipping
      // ahead. (Regression guard for chapters landing as 9,10,11 with the earlier ones missing.)
      const chapters = drafts.items.map(d => d.chapter).sort((a, b) => a - b);
      expect(chapters.slice(0, CHAPTERS)).toEqual(Array.from({ length: CHAPTERS }, (_, i) => i + 1));
      firstChapter = chapters[0] ?? 1;
    });

    await test.step('the chapter list renders the drafts', async () => {
      await page.goto(`/novels/${novelId}/chapters`);
      await expect(page.getByRole('heading', { level: 1, name: 'Chapters' })).toBeVisible();
      await expect(page.locator('.nf-selrow').first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step('record a review disposition', async () => {
      // The judge may flag continuity issues; approving is still a valid disposition to record.
      const res = await request.post(`/api/v1/projects/${novelId}/drafts/${firstChapter}/approve`, { data: {} });
      expect(res.ok()).toBeTruthy();
    });

    await test.step('run continuity validation', async () => {
      const res = await request.post(`/api/v1/projects/${novelId}/validate`);
      expect(res.ok()).toBeTruthy();
    });

    await test.step('open a scoped in-place refinement session', async () => {
      // The inline refinement dock opens a chat scoped to the section on screen; assert that a
      // chapter-scoped session can be created (the wiring behind the "Refine" affordance).
      const res = await request.post(`/api/v1/projects/${novelId}/chat/sessions`, {
        data: { scopeType: 'brief', scopeRef: `chapter:${firstChapter}`, title: `Chapter ${firstChapter}` },
      });
      expect(res.ok()).toBeTruthy();
      expect((await res.json()).scopeType).toBe('brief');
    });
  });
});
