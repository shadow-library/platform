/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import {
  holdPublishJob,
  publishForgeChapter,
  publishForgeNovel,
  readForgeLedger,
  releasePublishJob,
  removeForgePublication,
  unpublishForgeChapter,
} from '../web-novel/forge-publication';
import { uniqueNovelSlug } from '../web-novel/helpers';
import { expect, type ForgeActor, test } from './forge-actors';
import { expectCode } from './forge-arrange';
import { insertChapterRow } from './forge-bible';
import { expectImportLanded, startFinalImport } from './forge-bundles';
import { failPin, listDispatchedModelCalls } from './forge-db';
import { CHAPTER_ONE, readDraft, writeChapterByHand } from './forge-helpers';
import { readChapterRow } from './forge-review';
import { createGuardedProject, finalizeChapterNoReview, insertFinalChapters } from './forge-story';

/**
 * Defining types
 */

interface AmendAnswer {
  readonly chapter: number;
  readonly wordCount: number;
  readonly indexed: boolean;
  readonly republished: boolean;
  readonly publicationRevision?: number;
  readonly suggestExtractToBible: boolean;
}

interface RevisionRow {
  readonly revision: number;
  readonly source: string;
  readonly body: string;
}

/**
 * Declaring the constants
 *
 * Amend is the one write past a finalized chapter's lock: it replaces prose, title and note in place, carries the new prose into the final
 * draft under an `amended` revision, re-indexes it, and reschedules the reader's copy only when the payload the reader sees has changed.
 * The republish half runs against a real publication of the actor's own imported novel, under its own slug, removed with its reader rows.
 */

const AMENDED = 'Tamsin set her chain across the cobbles at dawn and counted the links three times, because the numbers had lied twice.';

function amend(owner: ForgeActor, projectId: string, chapter: number, data: Record<string, unknown>): Promise<APIResponse> {
  return mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/${chapter}/amend`, { data });
}

async function expectAmended(response: APIResponse, what: string): Promise<AmendAnswer> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(200);
  return (await response.json()) as AmendAnswer;
}

async function readRevisions(projectId: string, chapter: number): Promise<RevisionRow[]> {
  return novelForgeDb()<RevisionRow[]>`
    SELECT r.revision, r.source, r.body FROM draft_revisions r JOIN drafts d ON d.id = r.draft_id WHERE d.project_id = ${projectId} AND d.chapter = ${chapter} ORDER BY r.revision
  `;
}

async function readChunks(projectId: string, chapter: number): Promise<string[]> {
  const rows = await novelForgeDb()<{ text: string }[]>`SELECT text FROM chapter_chunks WHERE project_id = ${projectId} AND chapter = ${chapter} ORDER BY chunk_idx`;
  return rows.map(row => row.text);
}

test.describe('novel-forge chapter amend', () => {
  test('should rewrite finalized prose past the lock, keep what the Story Bible derived, and carry it into the final draft as an amended revision', async ({ forge }) => {
    const owner = await forge.actor({ label: 'amend' });
    const projectId = await createGuardedProject(forge, owner, 'amend');
    await expectCode(await amend(owner, projectId, 99, { content: AMENDED }), 404, 'CHP_001', 'amending a chapter that does not exist');
    await insertChapterRow({ projectId, number: 9, status: 'failed', locked: false });
    await expectCode(await amend(owner, projectId, 9, { content: AMENDED }), 400, 'CHP_006', 'amending a chapter that is not finalized canon');

    const final = await finalizeChapterNoReview(owner.ctx, projectId, await writeChapterByHand(owner.ctx, projectId, CHAPTER_ONE));
    await novelForgeDb()`UPDATE drafts SET judge = 'consistent', judge_note = 'Read against the old prose.' WHERE project_id = ${projectId} AND chapter = 1`;
    const before = await readChapterRow(projectId, 1);
    const latest = Math.max(final.revision, ...(await readRevisions(projectId, 1)).map(row => row.revision));

    const answer = await expectAmended(await amend(owner, projectId, 1, { content: AMENDED }), 'amending the prose alone');
    expect(answer).toMatchObject({ chapter: 1, wordCount: AMENDED.split(/\s+/).length, republished: false, suggestExtractToBible: true });
    expect(answer.publicationRevision, 'nothing was republished').toBeUndefined();
    expect(await readChapterRow(projectId, 1), 'the lock and everything the Story Bible derived stand; the omitted title is kept').toEqual({
      ...before,
      content: AMENDED,
    });
    const draft = await readDraft(owner.ctx, projectId, 1);
    expect(draft).toMatchObject({ status: 'final', body: AMENDED, revision: latest + 1 });
    const [judged] = await novelForgeDb()<{ judge: string | null; judgeNote: string | null }[]>`
      SELECT judge, judge_note AS "judgeNote" FROM drafts WHERE project_id = ${projectId} AND chapter = 1
    `;
    expect(judged, 'the verdict on the old prose is cleared').toEqual({ judge: null, judgeNote: null });
    const revisions = await readRevisions(projectId, 1);
    expect(revisions.find(row => row.revision === final.revision)?.body, 'the replaced prose stays in history').toBe(CHAPTER_ONE.body);
    expect(revisions.at(-1)).toEqual({ revision: latest + 1, source: 'amended', body: AMENDED });
    const chunks = (await readChunks(projectId, 1)).join(' ');
    expect(chunks, 'the index holds the amended prose').toContain('counted the links three times');
    expect(chunks, 'and never the old').not.toContain('counted the links twice');

    await expectAmended(
      await amend(owner, projectId, 1, { content: AMENDED, title: 'The Street That Moved Again', note: 'Revised after a reader caught a slip.' }),
      'amending title and note',
    );
    expect(await readChapterRow(projectId, 1)).toMatchObject({ title: 'The Street That Moved Again', note: 'Revised after a reader caught a slip.', locked: true, status: 'done' });
    expect((await readDraft(owner.ctx, projectId, 1)).revision, 'every amend takes the next revision').toBe(latest + 2);

    await insertFinalChapters(projectId, [{ number: 2, isolated: true, content: 'Walled-off prose.', summary: 'Kept apart.' }]);
    const isolated = await expectAmended(await amend(owner, projectId, 2, { content: 'Walled-off prose, amended.' }), 'amending an isolated chapter with no draft');
    expect(isolated.indexed, 'isolated prose is never indexed').toBe(false);
    expect(await readChunks(projectId, 2)).toEqual([]);
    expect(await readRevisions(projectId, 2), 'a chapter with no draft row keeps no revision history').toEqual([]);
    expect((await readChapterRow(projectId, 2))?.content).toBe('Walled-off prose, amended.');
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });

  test('should report an amend indexed only when every chunk of it was embedded', async ({ forge }) => {
    const owner = await forge.actor({ label: 'amend-indexed' });
    const projectId = await createGuardedProject(forge, owner, 'amend-indexed');
    await insertFinalChapters(projectId, [{ number: 1, content: CHAPTER_ONE.body }]);

    const answer = await expectAmended(await amend(owner, projectId, 1, { content: AMENDED }), 'amending a final chapter');
    const [chunks] = await novelForgeDb()<{ stored: number; embedded: number }[]>`
      SELECT count(*)::int AS stored, count(embedding)::int AS embedded FROM chapter_chunks WHERE project_id = ${projectId} AND chapter = 1
    `;
    expect(chunks?.stored, 'the amend stored the prose as chunks').toBeGreaterThan(0);
    expect(answer.indexed, `${chunks?.embedded ?? 0} of ${chunks?.stored ?? 0} chunks embedded`).toBe(chunks?.embedded === chunks?.stored);
    expect(await listDispatchedModelCalls(projectId)).toEqual([]);
  });

  test('should reschedule a published chapter only when the payload readers see moves, and never a withdrawn one', async ({ forge }) => {
    const owner = await forge.actor({ label: 'amend-publish' });
    const slug = uniqueNovelSlug('amend');
    let projectId = '';
    try {
      const started = await startFinalImport(owner.ctx, `E2E ${slug}`);
      projectId = started.projectId;
      await forge.quotaPin(projectId);
      await failPin(projectId);
      await expectImportLanded(started.jobId);
      await publishForgeNovel(owner.ctx, projectId, slug);
      for (const chapter of [1, 2]) expect((await publishForgeChapter(owner.ctx, projectId, chapter))?.status, `chapter ${chapter} reached the reader`).toBe('done');
      expect((await unpublishForgeChapter(owner.ctx, projectId, 2))?.status, 'chapter 2 was withdrawn').toBe('done');
      const [published, withdrawn] = await readForgeLedger(projectId);
      expect(published).toMatchObject({ chapter: 1, status: 'published' });
      expect(withdrawn).toMatchObject({ chapter: 2, status: 'unpublished' });

      await holdPublishJob(projectId);
      const moved = await expectAmended(await amend(owner, projectId, 1, { content: AMENDED }), 'amending published prose');
      expect(moved).toMatchObject({ republished: true, publicationRevision: (published?.revision ?? 0) + 1 });
      const [rescheduled] = await readForgeLedger(projectId);
      expect(rescheduled).toMatchObject({ status: 'scheduled', revision: (published?.revision ?? 0) + 1, publishedOrdinal: published?.publishedOrdinal });
      expect(rescheduled?.contentHash).not.toBe(published?.contentHash);

      const unchanged = await expectAmended(await amend(owner, projectId, 1, { content: AMENDED }), 'amending with the same prose');
      expect(unchanged.republished).toBe(false);
      expect((await readForgeLedger(projectId))[0], 'an unchanged payload leaves the ledger alone').toEqual(rescheduled);

      const rated = await expectAmended(await amend(owner, projectId, 1, { content: AMENDED, contentRating: { violence: 'mild' } }), 'changing only the rating');
      expect(rated, 'a rating-only change moves the reader payload').toMatchObject({ republished: true, publicationRevision: (rescheduled?.revision ?? 0) + 1 });

      const untouched = await expectAmended(await amend(owner, projectId, 2, { content: 'Withdrawn prose, amended.' }), 'amending a withdrawn chapter');
      expect(untouched.republished).toBe(false);
      expect((await readForgeLedger(projectId))[1], 'the withdrawal stands').toEqual(withdrawn);

      const never = await expectAmended(await amend(owner, projectId, 3, { content: 'Unpublished prose, amended.' }), 'amending a chapter never published');
      expect(never.republished).toBe(false);
      expect(await readForgeLedger(projectId)).toHaveLength(2);
      expect(await listDispatchedModelCalls(projectId)).toEqual([]);
    } finally {
      if (projectId) await releasePublishJob(projectId);
      await removeForgePublication(owner.ctx, projectId, slug);
    }
  });
});
