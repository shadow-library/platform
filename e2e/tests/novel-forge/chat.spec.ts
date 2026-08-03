/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate } from '../../lib';
import { AI_SKIP_REASON, aiAvailable, createProject, deleteProjectQuietly, jsonOrUndefined, pinHaiku, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The refinement chat hub, end-to-end against Haiku: open a manual project-scoped session, post a message and
 * get an assistant reply, read both back, then archive and prove a post to an archived session is refused with
 * CHT_002 before deleting the session. AI-gated and serial (the turn is a synchronous, gateway-serialised call).
 */

test.describe.configure({ mode: 'serial' });

/** A CSRF-authenticated POST with a 10-minute timeout — a chat turn blocks until the model reply lands. */
async function chatPost(ctx: APIRequestContext, url: string, data?: unknown): Promise<APIResponse> {
  await ctx.get('/api/auth/session');
  const { cookies } = await ctx.storageState();
  const token = cookies.find(c => c.name === 'csrf-token')?.value.split(':')[1];
  return ctx.post(url, { headers: token ? { 'x-csrf-token': token } : {}, timeout: 600_000, ...(data === undefined ? {} : { data }) });
}

test.describe('novel-forge refinement chat', () => {
  let ctx: APIRequestContext;
  let projectId: string;
  let sessionId: string;
  let available = false;

  test.beforeAll(async () => {
    available = await aiAvailable('user1');
    if (!available) return;
    ctx = await apiContext('novelForge', 'user1');
    const { id } = await createProject(ctx, { name: `e2e-forge-chat-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });
    projectId = id;
    await pinHaiku(ctx, projectId);
    await mutate(ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { brief: 'A cozy fantasy about a lighthouse keeper named Ilse.' } });
  });

  test.afterAll(async () => {
    if (projectId) await deleteProjectQuietly(ctx, projectId);
    await ctx?.dispose();
  });

  test.beforeEach(() => {
    test.skip(!available, AI_SKIP_REASON);
    test.setTimeout(600_000);
  });

  test('should open a manual project-scoped session, answer a turn, and list both messages', async () => {
    const create = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/chat/sessions`, { data: { scopeType: 'project', mode: 'manual' } });
    expect(create.status(), await create.text()).toBe(201);
    const session = (await create.json()) as { id: string; mode: string; status: string };
    sessionId = session.id;
    expect(session.mode).toBe('manual');
    expect(session.status).toBe('active');

    const turn = await chatPost(ctx, `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/messages`, { content: 'Rename the protagonist to Mara.' });
    expect(turn.status(), await turn.text()).toBe(201);
    const turnBody = (await turn.json()) as { userMessage: { content: string }; assistantMessage: { content: string }; runId: string };
    expect(turnBody.userMessage.content).toContain('Mara');
    expect(turnBody.assistantMessage.content.length).toBeGreaterThan(0);

    const messages = await ctx.get(`/api/v1/projects/${projectId}/chat/sessions/${sessionId}/messages`);
    expect(messages.status()).toBe(200);
    const list = (await messages.json()) as { messages: { role: string }[]; pendingTurn: boolean };
    expect(list.messages.length).toBeGreaterThanOrEqual(2);
    expect(list.messages.some(m => m.role === 'user')).toBe(true);
    expect(list.messages.some(m => m.role === 'assistant')).toBe(true);
    expect(list.pendingTurn).toBe(false);
  });

  test('should refuse a message to an archived session with CHT_002, then delete the session', async () => {
    const archive = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/archive`);
    expect(archive.status(), await archive.text()).toBe(200);
    expect((await archive.json()).status).toBe('archived');

    const blocked = await chatPost(ctx, `/api/v1/projects/${projectId}/chat/sessions/${sessionId}/messages`, { content: 'Another message.' });
    expect(blocked.status()).toBe(400);
    expect((await jsonOrUndefined<{ code: string }>(blocked))?.code).toBe('CHT_002');

    const del = await mutate(ctx, 'delete', `/api/v1/projects/${projectId}/chat/sessions/${sessionId}`);
    expect(del.status()).toBe(200);
  });
});
