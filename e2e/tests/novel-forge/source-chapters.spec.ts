/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, test } from './forge-actors';
import { errorCode, writeChapterByHand } from './forge-helpers';
import { createGuardedProject, insertThread, writeBrief } from './forge-story';

/**
 * Defining types
 */

interface SourceChapter {
  readonly id: string;
  readonly number: number;
  readonly title?: string | null;
  readonly content?: string | null;
  readonly status: string;
  readonly volumeKey?: string | null;
}

interface SourceChapterPage {
  readonly total: number;
  readonly items: SourceChapter[];
}

interface ChapterRow {
  readonly kind: 'written' | 'planned';
  readonly chapter: number;
}

/**
 * Declaring the constants
 *
 * Source chapters — the finalized `chapters` table rows an import (or an amend) leaves behind — as the pre-finalize manuscript-editing
 * routes see them: sanitized on write, immutable once locked, and listable by status, volume and point of view. Rows an import produces
 * are seeded straight into the database, since there is no hand-authoring route for them at this stage.
 */

async function expectRefused(response: APIResponse, status: number, code: string, what: string): Promise<void> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(status);
  expect(await errorCode(response), what).toBe(code);
}

function sourcePath(projectId: string, suffix = ''): string {
  return `/api/v1/projects/${projectId}/source/chapters${suffix}`;
}

interface ChapterSeed {
  number: number;
  content?: string;
  status?: 'done' | 'failed' | 'skipped';
  locked?: boolean;
  volumeKey?: string | null;
}

async function insertSourceChapter(projectId: string, seed: ChapterSeed): Promise<void> {
  const content = seed.content ?? `Chapter ${seed.number} prose.`;
  await novelForgeDb()`
    INSERT INTO chapters (project_id, number, content, status, locked, volume_key, word_count)
    VALUES (${projectId}, ${seed.number}, ${content}, ${seed.status ?? 'done'}::chapter_status, ${seed.locked ?? true}, ${seed.volumeKey ?? null}, ${content.split(/\s+/).length})
  `;
}

test.describe('novel-forge source chapters', () => {
  test('should sanitize a hand edit, escaping script and onerror while keeping markdown bold and inline-code angle brackets', async ({ forge }) => {
    const owner = await forge.actor({ label: 'source-sanitize' });
    const projectId = await createGuardedProject(forge, owner, 'source-sanitize');
    await insertSourceChapter(projectId, { number: 1, locked: false });

    // The dangerous markup sits mid-paragraph, not at the start of the line: a line that OPENS with <script> is an HTML
    // block under GFM (closed by the matching </script> on the same line) and swallows the whole line as one raw token,
    // which would escape the bold/code markers too instead of leaving them to their own inline tokens.
    const dangerous = 'Before it: <script>alert(1)</script> **bold text** an `<a href="x">` sample, plus <img src=x onerror="alert(2)">.';
    const updated = await mutate(owner.ctx, 'patch', sourcePath(projectId, '/1'), { data: { title: '<script>bad</script>Title', content: dangerous } });
    expect(updated.status(), await updated.text()).toBe(200);
    const body = (await updated.json()) as SourceChapter;
    // sanitizeMarkdown escapes raw HTML tokens' angle brackets rather than deleting their text — a script or an onerror
    // attribute can never again parse as a live tag, but the escaped words stay visible as inert text (`&lt;script&gt;`).
    expect(body.content).not.toMatch(/<script[^>]*>/);
    expect(body.content).not.toMatch(/<img\b[^>]*onerror/i);
    expect(body.content, 'the stripped tags survive only escaped').toMatch(/&lt;script&gt;/);
    expect(body.content, 'markdown bold markers survive').toContain('**bold text**');
    expect(body.content, 'inline-code angle brackets survive').toContain('`<a href="x">`');
    expect(body.title).not.toMatch(/<script[^>]*>/);
  });

  test('should refuse update and delete on a locked chapter, leaving its content untouched', async ({ forge }) => {
    const owner = await forge.actor({ label: 'source-locked' });
    const projectId = await createGuardedProject(forge, owner, 'source-locked');
    await insertSourceChapter(projectId, { number: 1, locked: true, content: 'The original locked prose.' });

    await expectRefused(await mutate(owner.ctx, 'patch', sourcePath(projectId, '/1'), { data: { content: 'An attempted rewrite.' } }), 409, 'CHP_008', 'patching a locked chapter');
    await expectRefused(await mutate(owner.ctx, 'delete', sourcePath(projectId, '/1')), 409, 'CHP_008', 'deleting a locked chapter');

    const untouched = await owner.ctx.get(sourcePath(projectId, '/1'));
    expect(((await untouched.json()) as SourceChapter).content).toBe('The original locked prose.');
  });

  test('should 404 a missing chapter on get, patch and delete', async ({ forge }) => {
    const owner = await forge.actor({ label: 'source-missing' });
    const projectId = await createGuardedProject(forge, owner, 'source-missing');

    await expectRefused(await owner.ctx.get(sourcePath(projectId, '/9')), 404, 'CHP_001', 'reading a missing chapter');
    await expectRefused(await mutate(owner.ctx, 'patch', sourcePath(projectId, '/9'), { data: { content: 'text' } }), 404, 'CHP_001', 'patching a missing chapter');
    await expectRefused(await mutate(owner.ctx, 'delete', sourcePath(projectId, '/9')), 404, 'CHP_001', 'deleting a missing chapter');
  });

  test('should filter the chapter list by status, volume and point of view, and jump to a chapter with goto', async ({ forge }) => {
    const owner = await forge.actor({ label: 'source-filters' });
    const projectId = await createGuardedProject(forge, owner, 'source-filters');
    // Briefs are written first: PUT /briefs/:n refuses a chapter at or behind the plan frontier (PLN_005), and a `done`
    // chapters row (below) puts its own number at or behind that frontier.
    await writeBrief(owner.ctx, projectId, 1, { body: 'Mira opens the ledger.', pov: 'mira' });
    await writeBrief(owner.ctx, projectId, 3, { body: 'Odo delivers the writ.', pov: 'odo' });
    await insertSourceChapter(projectId, { number: 1, status: 'done', volumeKey: 'v1' });
    await insertSourceChapter(projectId, { number: 2, status: 'failed', volumeKey: 'v1' });
    await insertSourceChapter(projectId, { number: 3, status: 'done', volumeKey: 'v2' });
    await insertThread(projectId, { key: 'e2e-thread', label: 'A thread opened in chapter one' });

    const byThread = (await (await owner.ctx.get(sourcePath(projectId, '?thread=e2e-thread'))).json()) as SourceChapterPage;
    expect(byThread.items.map(item => item.number)).toEqual([1]);
    const byOtherThread = (await (await owner.ctx.get(sourcePath(projectId, '?thread=no-such-thread'))).json()) as SourceChapterPage;
    expect(byOtherThread.items).toEqual([]);

    const byStatus = (await (await owner.ctx.get(sourcePath(projectId, '?status=done'))).json()) as SourceChapterPage;
    expect(byStatus.items.map(item => item.number).sort()).toEqual([1, 3]);

    const byVolume = (await (await owner.ctx.get(sourcePath(projectId, '?volumeKey=v2'))).json()) as SourceChapterPage;
    expect(byVolume.items.map(item => item.number)).toEqual([3]);

    const byPov = (await (await owner.ctx.get(sourcePath(projectId, '?pov=mira'))).json()) as SourceChapterPage;
    expect(byPov.items.map(item => item.number)).toEqual([1]);
    const byOtherPov = (await (await owner.ctx.get(sourcePath(projectId, '?pov=nobody'))).json()) as SourceChapterPage;
    expect(byOtherPov.items).toEqual([]);

    const gone = await owner.ctx.get(sourcePath(projectId, '?goto=99'));
    await expectRefused(gone, 404, 'CHP_001', 'jumping to a chapter that does not exist');
    const found = await owner.ctx.get(sourcePath(projectId, '?goto=2&limit=1'));
    expect(found.status(), await found.text()).toBe(200);
    expect(((await found.json()) as SourceChapterPage).items.map(item => item.number)).toContain(2);
  });
});

test.describe('novel-forge chapter rows overview', () => {
  test('should list written and planned rows together and filter to a point of view', async ({ forge }) => {
    const owner = await forge.actor({ label: 'chapter-rows' });
    const projectId = await createGuardedProject(forge, owner, 'chapter-rows');
    // "written" rows come from the `drafts` table (chapter-rows.service.ts), not from a finalized `chapters` row —
    // a hand-written draft is the model-free way to get one.
    await writeBrief(owner.ctx, projectId, 1, { body: 'Mira opens the ledger.', pov: 'mira' });
    await writeChapterByHand(owner.ctx, projectId, { title: 'One', body: 'Mira opens the ledger at dawn.' });
    await writeBrief(owner.ctx, projectId, 2, { body: 'A plan with no draft yet.', pov: 'odo' });

    const rows = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/chapter-rows?filter=all`)).json()) as { items: ChapterRow[] };
    expect(rows.items.map(row => [row.chapter, row.kind])).toEqual(
      expect.arrayContaining([
        [1, 'written'],
        [2, 'planned'],
      ]),
    );

    const mira = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/chapter-rows?filter=all&pov=mira`)).json()) as { items: ChapterRow[] };
    expect(mira.items.map(row => row.chapter)).toEqual([1]);

    const notWritten = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/chapter-rows?filter=not_written`)).json()) as { items: ChapterRow[] };
    expect(notWritten.items.map(row => row.chapter)).toEqual([2]);
    const needsReview = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/chapter-rows?filter=needs_review`)).json()) as { items: ChapterRow[] };
    expect(needsReview.items.map(row => row.chapter)).toEqual([1]);
  });
});
