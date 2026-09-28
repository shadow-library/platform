/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate } from '../../lib';
import { expect, type ForgeActor, test } from './forge-actors';
import { guardedProject } from './forge-arrange';
import { assertSpendGuarded } from './forge-db';
import { type ChapterText, errorCode, readDraft, writeChapterByHand } from './forge-helpers';
import { insertWriterSnapshot, markDraftIsolated } from './forge-rows';
import { writerPrompt } from './forge-story';

/**
 * Defining types
 */

interface Marked {
  readonly body: string;
  readonly summary: string;
}

interface MarkedChapter {
  readonly text: ChapterText;
  readonly marks: Marked;
}

interface SnapshotView {
  readonly messages: { role: string; content: string }[];
  readonly bibleHash: string | null;
  readonly isolated: boolean;
}

/**
 * Declaring the constants
 *
 * An isolated chapter's prose is walled off from every standard reader: the next chapter's writer pack, prose search, and the Writer's view
 * of any attempt on it. Only the author's own routes read it as written. Each chapter carries random markers in its prose and summary, and
 * a twin novel with the same chapter left standard shows each read does carry a neighbouring chapter when no wall stands in the way. An
 * isolated chapter routes unrestricted, where a fail-pin does nothing, so every novel is quota-pinned; nothing here reaches a model anyway.
 */

const WALLED_OFF = 'Prose: walled off. This is an unrestricted chapter, so the messages it sent are not available here.';

function marker(label: string): string {
  return `e2emark${label}${randomBytes(6).toString('hex')}`;
}

function markedChapter(label: string): MarkedChapter {
  const marks = { body: marker(`${label}body`), summary: marker(`${label}summary`) };
  return {
    marks,
    text: {
      title: `The ${label} chapter`,
      body: `Tamsin set her chain across the cobbles and counted the links twice.\n\nShe wrote ${marks.body} in her ledger and underlined it.`,
      summary: `Tamsin records ${marks.summary} in her survey ledger.`,
    },
  };
}

/** Pasting with `isolated: true` answers 500 today (see the fixme), so the chapter is written by hand and isolated as the paste stores it. */
async function writeIsolatedChapter(owner: ForgeActor, projectId: string, text: ChapterText): Promise<void> {
  const draft = await writeChapterByHand(owner.ctx, projectId, text);
  await markDraftIsolated(projectId, draft.chapter);
}

async function searchHits(ctx: APIRequestContext, projectId: string, q: string): Promise<number[]> {
  const response = await ctx.get(`/api/v1/projects/${projectId}/source/chapters/search?q=${encodeURIComponent(q)}`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { items: { number: number }[] }).items.map(item => item.number);
}

async function snapshot(ctx: APIRequestContext, projectId: string, chapter: number, snapshotId: string): Promise<APIResponse> {
  return ctx.get(`/api/v1/projects/${projectId}/chapters/${chapter}/writer-snapshots/${snapshotId}`);
}

async function readSnapshot(ctx: APIRequestContext, projectId: string, chapter: number, snapshotId: string): Promise<SnapshotView> {
  const response = await snapshot(ctx, projectId, chapter, snapshotId);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as SnapshotView;
}

async function mechanicsReview(ctx: APIRequestContext, projectId: string, chapter: number): Promise<{ isolated: boolean; kind: string }> {
  await assertSpendGuarded(projectId, { requireQuota: true });
  const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/chapters/${chapter}/reviews`, { data: { kind: 'mechanics' } });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { isolated: boolean; kind: string };
}

test.describe('novel-forge isolated chapters', () => {
  test("should keep an isolated chapter's prose out of the next chapter's writer and out of search", async ({ forge }) => {
    const owner = await forge.actor({ label: 'isolation-reads' });
    const isolatedNovel = await guardedProject(forge, owner, 'isolation-walled');
    const standardNovel = await guardedProject(forge, owner, 'isolation-open');
    const walled = markedChapter('walled');
    const open = markedChapter('open');
    const next = markedChapter('next');

    await writeIsolatedChapter(owner, isolatedNovel, walled.text);
    await writeChapterByHand(owner.ctx, isolatedNovel, next.text);
    await writeChapterByHand(owner.ctx, standardNovel, open.text);
    await writeChapterByHand(owner.ctx, standardNovel, next.text);

    const control = await writerPrompt(owner.ctx, standardNovel, 2);
    for (const mark of Object.values(open.marks)) expect(control, "a standard chapter 1's prose and summary reach chapter 2's writer").toContain(mark);
    const prompt = await writerPrompt(owner.ctx, isolatedNovel, 2);
    for (const mark of Object.values(walled.marks)) expect(prompt, "the isolated chapter's prose and summary never reach it").not.toContain(mark);

    expect(await searchHits(owner.ctx, standardNovel, open.marks.body), 'search finds a standard chapter').toEqual([1]);
    expect(await searchHits(owner.ctx, isolatedNovel, walled.marks.body), 'and never an isolated one').toEqual([]);
    expect(await searchHits(owner.ctx, isolatedNovel, next.marks.body), 'while its standard neighbour stays searchable').toEqual([2]);
  });

  test("should wall off the Writer's view of an isolated chapter and review it as isolated, while its author reads it as written", async ({ forge }) => {
    const owner = await forge.actor({ label: 'isolation-views' });
    const projectId = await guardedProject(forge, owner, 'isolation-views');
    const walled = markedChapter('walled');
    const next = markedChapter('next');
    await writeIsolatedChapter(owner, projectId, walled.text);
    await writeChapterByHand(owner.ctx, projectId, next.text);

    const sent = [{ role: 'user', content: `Write on from ${walled.marks.body}` }];
    const standardOnIsolated = await insertWriterSnapshot({ projectId, chapter: 1, isolated: false, messages: sent, bibleHash: 'e2e-bible-hash' });
    const isolatedOnStandard = await insertWriterSnapshot({ projectId, chapter: 2, isolated: true, messages: sent, bibleHash: 'e2e-bible-hash' });
    const standard = await insertWriterSnapshot({ projectId, chapter: 2, isolated: false, messages: sent, bibleHash: 'e2e-bible-hash' });

    expect(await readSnapshot(owner.ctx, projectId, 1, standardOnIsolated), 'a chapter isolated now walls off even an attempt made before').toEqual(
      expect.objectContaining({ messages: [{ role: 'system', content: WALLED_OFF }], bibleHash: null, isolated: true }),
    );
    expect(await readSnapshot(owner.ctx, projectId, 2, isolatedOnStandard), 'an attempt made isolated stays walled off').toEqual(
      expect.objectContaining({ messages: [{ role: 'system', content: WALLED_OFF }], bibleHash: null, isolated: true }),
    );
    expect(await readSnapshot(owner.ctx, projectId, 2, standard), 'a standard attempt on a standard chapter reads as sent').toEqual(
      expect.objectContaining({ messages: sent, bibleHash: 'e2e-bible-hash', isolated: false }),
    );
    for (const [chapter, snapshotId, what] of [
      [2, standardOnIsolated, "another chapter's attempt"],
      [1, '999999999999', 'an attempt that does not exist'],
    ] as const) {
      const missing = await snapshot(owner.ctx, projectId, chapter, snapshotId);
      expect(missing.status(), `${what} — body ${await missing.text()}`).toBe(404);
      expect(await errorCode(missing), what).toBe('WSN_001');
    }

    expect((await readDraft(owner.ctx, projectId, 1)).body, 'the author reads the isolated chapter as written').toContain(walled.marks.body);
    const versions = await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/1/versions`);
    expect(versions.status(), await versions.text()).toBe(200);
    const items = ((await versions.json()) as { items: { current: boolean; isolated: boolean }[] }).items;
    expect(items.find(item => item.current)?.isolated, 'the current version is marked isolated').toBe(true);

    expect(await mechanicsReview(owner.ctx, projectId, 1), 'a review of the isolated chapter is marked isolated').toMatchObject({ kind: 'mechanics', isolated: true });
    expect(await mechanicsReview(owner.ctx, projectId, 2), 'its standard neighbour is not').toMatchObject({ kind: 'mechanics', isolated: false });
  });
});
