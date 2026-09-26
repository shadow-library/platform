/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, type Request, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, requireProductUrl, storageStateFor } from '../../lib';
import { createNovel, deleteProjectQuietly, NOVEL_NOTES, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface ChatSession {
  id: string;
  mode: string;
  status: string;
}

/**
 * Declaring the constants
 *
 * Starting a novel, AI-free. The Start dialog queues an opening message that the chat sends on arrival; the UI test intercepts that
 * turn so it proves the hand-off without spending a model call.
 */

const TURN_STREAM = '**/api/v1/projects/*/chats/*/turn/stream';

test.describe('novel-forge new novel (API)', () => {
  let ctx: APIRequestContext;
  const created: string[] = [];

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
  });

  test.afterAll(async () => {
    for (const projectId of created) await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
  });

  test('should create a new_novel project with verbatim notes and an auto-mode chat', async () => {
    const title = `E2E Start ${uniqueSuffix()}`;
    const novel = await createNovel(ctx, { title, notes: NOVEL_NOTES });
    created.push(novel.projectId);

    const project = (await (await ctx.get(`/api/v1/projects/${novel.projectId}`)).json()) as { kind: string; title: string; contentMode: string };
    expect(project).toMatchObject({ kind: 'new_novel', title, contentMode: 'standard' });

    const notes = (await (await ctx.get(`/api/v1/projects/${novel.projectId}/notes`)).json()) as { notes: string };
    expect(notes.notes).toBe(NOVEL_NOTES);

    const session = (await (await ctx.get(`/api/v1/projects/${novel.projectId}/chat/sessions/${novel.sessionId}`)).json()) as ChatSession;
    expect(session).toMatchObject({ id: novel.sessionId, mode: 'auto', status: 'active' });

    const progress = await ctx.get(`/api/v1/projects/${novel.projectId}/progress`);
    expect(progress.status()).toBe(200);
    expect(((await progress.json()) as { items: unknown[] }).items.length).toBeGreaterThan(0);
  });

  test('should keep the chosen content mode as the project default', async () => {
    const novel = await createNovel(ctx, { title: `E2E Unrestricted ${uniqueSuffix()}`, contentMode: 'unrestricted' });
    created.push(novel.projectId);

    expect((await (await ctx.get(`/api/v1/projects/${novel.projectId}`)).json()).contentMode).toBe('unrestricted');
  });
});

test.describe('novel-forge new novel (UI)', () => {
  test.use({ storageState: storageStateFor('user1') });

  let ctx: APIRequestContext;
  let projectId = '';

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
  });

  test.afterAll(async () => {
    if (projectId) await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
  });

  test('should start a novel from the dialog and hand its opening message to the chat', async ({ page }) => {
    const title = `E2E Dialog Novel ${uniqueSuffix()}`;
    const openers: Request[] = [];
    await page.route(TURN_STREAM, async route => {
      openers.push(route.request());
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'E2E_BLOCKED', message: 'blocked by the e2e run' }) });
    });

    await page.goto(`${requireProductUrl('novelForge')}/`);

    // The header button can register a pre-hydration click that no-ops, so the dialog is opened on a poll.
    const dialog = page.getByRole('dialog', { name: 'Start a new novel' });
    await expect(async () => {
      await page.getByRole('button', { name: 'New novel', exact: true }).first().click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await dialog.getByLabel('Working name').fill(title);
    await dialog.getByLabel('Your notes').fill(NOVEL_NOTES);
    await expect(dialog.getByRole('radio', { name: 'Standard' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Create and open chat' }).click();

    await expect(page).toHaveURL(/\/novels\/\d+\/chat\?session=[0-9a-f-]+/, { timeout: 20_000 });
    projectId = /\/novels\/(\d+)\//.exec(page.url())?.[1] ?? '';

    await expect.poll(() => openers.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const opener = openers[0]?.postDataJSON() as { content?: string };
    expect(opener.content?.trim().length ?? 0).toBeGreaterThan(0);
    expect(openers[0]?.url()).toContain(new URL(page.url()).searchParams.get('session') ?? '<no session>');

    const notes = (await (await ctx.get(`/api/v1/projects/${projectId}/notes`)).json()) as { notes: string };
    expect(notes.notes).toBe(NOVEL_NOTES);
  });

  test('should open a novel and its retired screens on the chat', async ({ page }) => {
    const novel = await createNovel(ctx, { title: `E2E Home ${uniqueSuffix()}` });
    const base = `${requireProductUrl('novelForge')}/novels/${novel.projectId}`;
    try {
      await page.goto(base);
      await expect(page).toHaveURL(/\/chat(\?|$)/, { timeout: 20_000 });
      await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

      await page.goto(`${base}/blueprint`);
      await expect(page).toHaveURL(/\/chat(\?|$)/, { timeout: 20_000 });
    } finally {
      await deleteProjectQuietly(ctx, novel.projectId);
    }
  });
});
