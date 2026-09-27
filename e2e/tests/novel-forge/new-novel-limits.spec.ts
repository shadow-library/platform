/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { expect, test } from './forge-actors';
import { expectCode, newChatSession, newProject } from './forge-arrange';
import { insertChatMessage } from './forge-bible';
import { NOVEL_NOTES, uniqueSuffix } from './forge-helpers';

/**
 * Declaring the constants
 *
 * NF2-NEW-01 — new novel, notes and progress. Every route here is model-free (title/notes/progress are plain CRUD), so no project
 * needs a spend guard. The happy path (verbatim notes, an auto-mode chat) lives in `new-novel.spec.ts`; this file covers the caps,
 * refusals and ownership checks.
 */

const TEN_THOUSAND_AND_ONE_WORDS = Array.from({ length: 10_001 }, (_, index) => `word${index}`).join(' ');

const SIX_HUNDRED_WORD_MESSAGE = Array.from({ length: 600 }, (_, index) => `substantial${index}`).join(' ');

const SHORT_MESSAGE = 'Too short to keep as notes.';

test.describe('novel-forge new novel, notes and progress (NF2-NEW-01)', () => {
  test('should refuse a blank title after trimming', async ({ forge }) => {
    const owner = await forge.actor({ label: 'new-novel-title' });
    const blank = await mutate(owner.ctx, 'post', '/api/v1/projects/new-novel', { data: { title: '   \t  ' } });
    await expectCode(blank, 400, 'PRJ_014', 'a title that is blank once trimmed');
  });

  test('should refuse notes over the 10,000 word cap on create, leaving no project row', async ({ forge }) => {
    const owner = await forge.actor({ label: 'new-novel-create-cap' });
    const title = `E2E Over-cap ${uniqueSuffix()}`;
    const overCap = await mutate(owner.ctx, 'post', '/api/v1/projects/new-novel', { data: { title, notes: TEN_THOUSAND_AND_ONE_WORDS } });
    await expectCode(overCap, 400, 'PRJ_012', 'notes over the 10,000 word cap on create');

    const list = await owner.ctx.get(`/api/v1/projects?limit=50`);
    expect(list.status(), await list.text()).toBe(200);
    const titles = ((await list.json()) as { items: { title: string | null }[] }).items.map(item => item.title);
    expect(titles, 'the refused create left no project row behind').not.toContain(title);
  });

  test('should cap notes at 10,000 words on PUT, and round-trip them verbatim', async ({ forge }) => {
    const owner = await forge.actor({ label: 'new-novel-notes-cap' });
    const projectId = await newProject(owner, 'new-novel-notes');

    const overCap = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/notes`, { data: { notes: TEN_THOUSAND_AND_ONE_WORDS } });
    await expectCode(overCap, 400, 'PRJ_012', 'notes over the 10,000 word cap');

    const withinCap = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/notes`, { data: { notes: NOVEL_NOTES } });
    expect(withinCap.status(), await withinCap.text()).toBe(204);
    const read = await owner.ctx.get(`/api/v1/projects/${projectId}/notes`);
    expect(((await read.json()) as { notes: string }).notes).toBe(NOVEL_NOTES);
  });

  test('should save a long enough message as notes, and refuse an assistant message, another session’s message, or a short one', async ({ forge }) => {
    const owner = await forge.actor({ label: 'new-novel-from-message' });
    const projectId = await newProject(owner, 'new-novel-from-message');
    const sessionId = await newChatSession(owner, projectId);
    const otherSessionId = await newChatSession(owner, projectId);
    const base = `/api/v1/projects/${projectId}/notes/from-message`;

    const assistantMessageId = await insertChatMessage({ projectId, sessionId, role: 'assistant', content: SIX_HUNDRED_WORD_MESSAGE });
    await expectCode(await mutate(owner.ctx, 'post', base, { data: { sessionId, messageId: assistantMessageId } }), 404, 'NTS_005', 'saving an assistant message as notes');

    const otherSessionMessageId = await insertChatMessage({ projectId, sessionId: otherSessionId, role: 'user', content: SIX_HUNDRED_WORD_MESSAGE });
    await expectCode(
      await mutate(owner.ctx, 'post', base, { data: { sessionId, messageId: otherSessionMessageId } }),
      404,
      'NTS_005',
      'saving another session’s message under the wrong session id',
    );

    const shortMessageId = await insertChatMessage({ projectId, sessionId, role: 'user', content: SHORT_MESSAGE });
    await expectCode(await mutate(owner.ctx, 'post', base, { data: { sessionId, messageId: shortMessageId } }), 400, 'NTS_006', 'saving a too-short message as notes');

    const longMessageId = await insertChatMessage({ projectId, sessionId, role: 'user', content: SIX_HUNDRED_WORD_MESSAGE });
    const saved = await mutate(owner.ctx, 'post', base, { data: { sessionId, messageId: longMessageId } });
    expect(saved.status(), await saved.text()).toBe(200);
    const notes = await owner.ctx.get(`/api/v1/projects/${projectId}/notes`);
    expect(((await notes.json()) as { notes: string }).notes).toContain(SIX_HUNDRED_WORD_MESSAGE);
  });

  test('should round-trip a progress override, and keep every route to its owner', async ({ forge }) => {
    const owner = await forge.actor({ label: 'new-novel-progress-owner' });
    const stranger = await forge.actor({ label: 'new-novel-progress-stranger' });
    const projectId = await newProject(owner, 'new-novel-progress');

    const dismissed = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/progress/premise`, { data: { status: 'dismissed' } });
    expect(dismissed.status(), await dismissed.text()).toBe(200);
    const afterDismiss = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/progress`)).json()) as { items: { key: string; status: string }[] };
    expect(afterDismiss.items.find(item => item.key === 'premise')?.status).toBe('dismissed');

    const cleared = await mutate(owner.ctx, 'delete', `/api/v1/projects/${projectId}/progress/premise`);
    expect(cleared.status(), await cleared.text()).toBe(200);
    const afterClear = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/progress`)).json()) as { items: { key: string; status: string }[] };
    expect(afterClear.items.find(item => item.key === 'premise')?.status).not.toBe('dismissed');

    await expectCode(await stranger.ctx.get(`/api/v1/projects/${projectId}/notes`), 404, 'PRJ_001', "a stranger reading the owner's notes");
    await expectCode(
      await mutate(stranger.ctx, 'put', `/api/v1/projects/${projectId}/notes`, { data: { notes: 'intrusion' } }),
      404,
      'PRJ_001',
      "a stranger writing the owner's notes",
    );
    await expectCode(
      await mutate(stranger.ctx, 'post', `/api/v1/projects/${projectId}/notes/from-message`, { data: { sessionId: '00000000-0000-0000-0000-000000000000', messageId: '1' } }),
      404,
      'PRJ_001',
      "a stranger saving a message into the owner's notes",
    );
    await expectCode(await stranger.ctx.get(`/api/v1/projects/${projectId}/progress`), 404, 'PRJ_001', "a stranger reading the owner's progress");
    await expectCode(
      await mutate(stranger.ctx, 'put', `/api/v1/projects/${projectId}/progress/premise`, { data: { status: 'dismissed' } }),
      404,
      'PRJ_001',
      "a stranger overriding the owner's progress",
    );
    await expectCode(await mutate(stranger.ctx, 'delete', `/api/v1/projects/${projectId}/progress/premise`), 404, 'PRJ_001', "a stranger clearing the owner's progress");
  });
});
