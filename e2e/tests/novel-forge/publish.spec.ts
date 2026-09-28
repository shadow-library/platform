/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, csrfHeaders, mutate, PERSONAS, runAll, subFor } from '../../lib';
import { expect, test } from '../web-novel/forge-fixtures';
import {
  FORGE_CLIENT_ID,
  holdPublishJob,
  publishForge,
  publishForgeChapter,
  readForgeChapterContent,
  readForgeLedger,
  readForgePublication,
  reconcileForge,
  reconcileSettled,
  releasePublishJob,
  removeForgePublication,
  rescheduleForgeChapter,
  reviseForgeChapter,
  unpublishForgeChapter,
} from '../web-novel/forge-publication';
import {
  auditWatermark,
  deleteNovels,
  insertServedChapter,
  publishAuditSince,
  readServedChapters,
  readServedNovel,
  readServedNovelsByRef,
  readServedWikiEntry,
  updateServedChapter,
  updateServedNovel,
} from '../web-novel/helpers';
import { expectImportLanded, startFinalImport } from './forge-bundles';
import { createEntity, type EntitySeed, jsonOrUndefined, pollWebNovel, reconcileUntilConverged, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface NovelDetail {
  title: string;
  author?: string;
}

/**
 * Declaring the constants
 *
 * The fast, AI-free content path: hand-author a valid `final`-mode novel-import bundle, land it in one call,
 * publish metadata + chapters, exercise the forge-side gates (PUB_002/PUB_003) and access management, then
 * verify the one-way push reached web-novel, including a RESTRICTED grant.
 *
 * The second half drives web-novel's `/internal/novels/*` ingest the only way it can be reached: novel-forge's converge, as the author's
 * project publishes. Outcomes are read from web-novel's own tables — the served rows and one `publish_audit_log` row per push. A state the
 * forge would never produce (a newer reader revision, a foreign publish token, a drifted row) is written straight into the reader, and
 * the push that meets it is real. Out of reach this way, since forge always sends its own `sourceRef`, managed token and a self-consistent
 * hash and never pushes for a novel it has not created: a second publisher, a tokenless push, a push with no `sourceRef`, a wrong content
 * hash, `authorNote` absent vs null (forge never sends null), an unknown novel, and a repeated unpublish reaching the reader (forge only
 * deletes an ordinal the reader's manifest still lists). Two first pushes fired together cannot be forced to overlap, so the reader's
 * insert-race retry is not proven here.
 */

const RATED = { violence: 'mild' };

const KEEPER: EntitySeed = { entityKey: 'e2e-keeper', type: 'character', name: 'Mira the Keeper', body: 'The keeper of the coast light for eleven winters.' };

function readerUrl(slug: string): string {
  return `/api/novels/${slug}`;
}

test.describe('novel-forge import and publish pipeline', () => {
  test.describe.configure({ mode: 'serial' });

  const slug = `e2e-forge-pub-${uniqueSuffix()}`;
  const novelTitle = `E2E Forge Published ${uniqueSuffix()}`;
  let forgeCtx: APIRequestContext;
  let webGuestCtx: APIRequestContext;
  let webUser2Ctx: APIRequestContext;
  let projectId = '';

  test.beforeAll(async () => {
    forgeCtx = await apiContext('novelForge', 'user1');
    webGuestCtx = await apiContext('webNovel');
    webUser2Ctx = await apiContext('webNovel', 'user2');
  });

  test.afterAll(async () => {
    await runAll([() => removeForgePublication(forgeCtx, projectId, slug), () => forgeCtx.dispose(), () => webGuestCtx.dispose(), () => webUser2Ctx.dispose()]);
  });

  test('should import a valid final bundle and land its chapters', async () => {
    const { projectId: pid, jobId } = await startFinalImport(forgeCtx, novelTitle);
    projectId = pid;
    expect(projectId).toMatch(/^[0-9]+$/);
    await expectImportLanded(jobId);

    // The import writes into the `chapters` table (not finalized `drafts`), which the source-chapters listing
    // reads back — three chapters, contiguous from 1, titled as authored.
    const chapters = await forgeCtx.get(`/api/v1/projects/${projectId}/source/chapters`);
    expect(chapters.status()).toBe(200);
    const body = (await chapters.json()) as { items: { number: number; title: string }[] };
    expect(body.items.map(c => c.number)).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(body.items.map(c => c.title)).toEqual(expect.arrayContaining(['The Last Watch', 'A Voice in the Foam', 'What the Tide Keeps']));
  });

  test('should publish novel metadata under the chosen slug', async () => {
    const response = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/publish`, {
      data: { novelSlug: slug, title: novelTitle, genres: ['Fantasy'] },
    });
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as { novelSlug: string; title: string };
    expect(body.novelSlug).toBe(slug);
    expect(body.title).toBe(novelTitle);
  });

  test('should enforce contiguous chapter publishing (PUB_003) on the forge ledger', async () => {
    // These are pure forge-side gates on the publication ledger — they hold regardless of whether the
    // downstream reader push succeeds. Chapter 1 is accepted (202, enqueued)...
    const ch1 = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/chapters/1/publish`, { data: {} });
    expect(ch1.status(), await ch1.text()).toBe(202);

    // ...then chapter 3 (skipping 2) must be refused — readers never see a hole.
    const ch3 = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/chapters/3/publish`, { data: {} });
    expect(ch3.status()).toBe(400);
    expect((await jsonOrUndefined<{ code: string }>(ch3))?.code).toBe('PUB_003');

    // Chapter 2 restores contiguity and is accepted.
    const ch2 = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/chapters/2/publish`, { data: {} });
    expect(ch2.status(), await ch2.text()).toBe(202);
  });

  test('should reject publishing an absent chapter with PUB_002 or a 404', async () => {
    const response = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/chapters/99/publish`, { data: {} });
    expect([400, 404]).toContain(response.status());
    const code = (await jsonOrUndefined<{ code: string }>(response))?.code;
    expect(['PUB_002', 'CHP_001']).toContain(code);
  });

  test('should resolve a RESTRICTED share grant for user2 by email, then reopen to public', async () => {
    // Forge-side access management, independent of the reader push. Proves the identity M2M path
    // (resolveUsersByEmail) works: user2's address resolves to a subject, so the grant is `resolved`, not
    // `pending`. The reader-side effect of a grant is asserted after reconcile below.
    const access = await mutate(forgeCtx, 'put', `/api/v1/projects/${projectId}/publications/access`, {
      data: { visibility: 'RESTRICTED', grants: [{ email: PERSONAS.user2.email }] },
    });
    expect(access.status(), await access.text()).toBe(200);
    const accessBody = (await access.json()) as { visibility: string; grants: { email: string; subjectId?: string | null; state: string }[] };
    expect(accessBody.visibility).toBe('RESTRICTED');
    const grant = accessBody.grants.find(g => g.email === PERSONAS.user2.email.toLowerCase());
    expect(grant?.state, `user2 grant did not resolve: ${JSON.stringify(accessBody.grants)}`).toBe('resolved');
    expect(grant?.subjectId).toBe(subFor('user2'));

    const reopen = await mutate(forgeCtx, 'put', `/api/v1/projects/${projectId}/publications/access`, { data: { visibility: 'PUBLIC' } });
    expect(reopen.status()).toBe(200);
    expect((await reopen.json()).visibility).toBe('PUBLIC');
  });

  test('should run reconcile and report the pushed chapters', async () => {
    const response = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/publications/reconcile`);
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as { novel: string; pushed: number[]; failed: number[] };
    expect(['applied', 'noop']).toContain(body.novel);
    expect(Array.isArray(body.pushed)).toBe(true);
    expect(body.failed).toEqual([]);
  });

  test('should surface the published novel and its chapters on web-novel', async () => {
    const detail = await pollWebNovel(webGuestCtx, `/api/novels/${slug}`, 200);
    expect(detail.status()).toBe(200);
    const detailBody = (await detail.json()) as { title: string; chapterCount: number };
    expect(detailBody.title).toBe(novelTitle);
    expect(detailBody.chapterCount).toBeGreaterThanOrEqual(2);
    const chapters = await webGuestCtx.get(`/api/novels/${slug}/chapters`);
    expect((await chapters.json()).items.map((c: { ordinal: number }) => c.ordinal)).toEqual(expect.arrayContaining([1, 2]));
  });

  test('should restrict web-novel reads to the granted user and hide from guests', async () => {
    const access = await mutate(forgeCtx, 'put', `/api/v1/projects/${projectId}/publications/access`, {
      data: { visibility: 'RESTRICTED', grants: [{ email: PERSONAS.user2.email }] },
    });
    expect(access.status(), await access.text()).toBe(200);
    expect((await pollWebNovel(webGuestCtx, `/api/novels/${slug}`, 404)).status()).toBe(404);
    expect((await pollWebNovel(webUser2Ctx, `/api/novels/${slug}`, 200)).status()).toBe(200);
  });

  test('should reject a garbage bundle with a 422 validation error', async () => {
    // Missing envelope literals + no volumes is rejected by schema validation before any DB write.
    const response = await mutate(forgeCtx, 'post', '/api/v1/import', { data: { bundle: { format: 'not-a-bundle', novel: {} } } });
    expect(response.status()).toBe(422);
    expect((await jsonOrUndefined<{ code: string }>(response))?.code).toBe('VALIDATION_ERROR');
  });

  test('should delete the forge project', async () => {
    const del = await mutate(forgeCtx, 'delete', `/api/v1/projects/${projectId}`);
    expect(del.status()).toBe(204);
    projectId = '';
  });
});

test.describe('web-novel novel and chapter ingest through novel-forge', () => {
  test.describe.configure({ timeout: 120_000 });

  test('should create a forge-owned novel, answer an unchanged resend as a no-op, and apply a newer or changed push', async ({ forge }) => {
    const publication = await forge.project('pub-ladder');
    const { ctx, projectId, slug } = publication;

    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Salt Road' }))?.status).toBe('done');
    const [created] = await readServedNovelsByRef(FORGE_CLIENT_ID, projectId);
    expect(created).toEqual(expect.objectContaining({ slug, sourceClientId: FORGE_CLIENT_ID, sourceRef: projectId, title: 'The Salt Road', revision: 1 }));
    expect(await publishAuditSince(slug, '0', 'novel.upsert')).toEqual([
      expect.objectContaining({ outcome: 'applied', incomingRevision: 1, storedRevision: null, callerClientId: FORGE_CLIENT_ID }),
    ]);

    const resending = await auditWatermark(slug);
    expect((await reconcileSettled(publication)).novel).toBe('noop');
    expect(await readServedNovel(slug), 'a no-op must not rewrite the row').toEqual(created);
    expect(await publishAuditSince(slug, resending, 'novel.upsert')).toEqual([expect.objectContaining({ outcome: 'noop', incomingRevision: 1, storedRevision: 1 })]);

    const blurb = 'A caravan crosses a desert of salt.';
    const describing = await auditWatermark(slug);
    expect((await publishForge(ctx, projectId, { blurb }))?.status).toBe('done');
    expect(await readServedNovel(slug)).toEqual(expect.objectContaining({ id: created?.id, blurb, revision: 2 }));
    expect(await publishAuditSince(slug, describing, 'novel.upsert')).toEqual([expect.objectContaining({ outcome: 'applied', incomingRevision: 2, storedRevision: 1 })]);

    await updateServedNovel(slug, { title: 'A title the forge never sent' });
    const drifting = await auditWatermark(slug);
    expect((await reconcileSettled(publication)).novel, 'an equal revision carrying different metadata is not a no-op').toBe('applied');
    expect(await readServedNovel(slug)).toEqual(expect.objectContaining({ title: 'The Salt Road', revision: 2 }));
    expect(await publishAuditSince(slug, drifting, 'novel.upsert')).toEqual([expect.objectContaining({ outcome: 'applied', incomingRevision: 2, storedRevision: 2 })]);
  });

  test('should refuse a stale novel revision and leave the stored row untouched', async ({ forge }) => {
    const publication = await forge.project('pub-stale');
    const { ctx, projectId, slug } = publication;
    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Salt Road' }))?.status).toBe('done');

    await updateServedNovel(slug, { revision: 7 });
    const held = await readServedNovel(slug);
    const pushing = await auditWatermark(slug);
    expect((await reconcileForge(publication)).ok(), 'the author is told the reader refused the push').toBe(false);
    expect(await readServedNovel(slug)).toEqual(held);
    expect(await publishAuditSince(slug, pushing, 'novel.upsert')).toEqual([expect.objectContaining({ outcome: 'stale_rejected', incomingRevision: 1, storedRevision: 7 })]);

    await updateServedNovel(slug, { revision: 1 });
    expect((await publishForge(ctx, projectId, { title: 'The Salt Road, Revised' }))?.status).toBe('done');
    expect(await readServedNovel(slug)).toEqual(expect.objectContaining({ title: 'The Salt Road, Revised', revision: 2 }));
  });

  test('should leave one reader novel when two first pushes of one project are fired together', async ({ forge }) => {
    const publication = await forge.project('pub-race');
    const { ctx, projectId, slug } = publication;
    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Salt Road' }))?.status).toBe('done');
    await deleteNovels([slug]);

    const headers = await csrfHeaders(ctx);
    const reconcile = (): Promise<APIResponse> => ctx.post(`/api/v1/projects/${projectId}/publications/reconcile`, { headers });
    const pushes = await Promise.all([reconcile(), reconcile()]);
    expect(pushes.map(push => push.status())).toEqual([200, 200]);
    expect(await readServedNovelsByRef(FORGE_CLIENT_ID, projectId)).toEqual([expect.objectContaining({ slug, revision: 1 })]);
    expect((await publishAuditSince(slug, '0', 'novel.upsert')).map(row => row.outcome).sort()).toEqual(['applied', 'noop']);
  });

  test("should trim a curator's original author, apply an author-only change, and clear it on a blank or null push", async ({ forge }) => {
    const { ctx, projectId, slug } = await forge.project('pub-author', { ctx: await forge.curator() });
    const servedAuthor = async (): Promise<string | undefined> => ((await (await forge.guest.get(readerUrl(slug))).json()) as NovelDetail).author;

    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Salt Road', originalAuthor: '  Ada Lovelace  ' }))?.status).toBe('done');
    expect(await readServedNovel(slug)).toEqual(expect.objectContaining({ originalAuthor: 'Ada Lovelace', revision: 1 }));
    expect(await servedAuthor()).toBe('Ada Lovelace');

    const reattributing = await auditWatermark(slug);
    expect((await publishForge(ctx, projectId, { originalAuthor: 'Grace Hopper' }))?.status).toBe('done');
    expect(await readServedNovel(slug)).toEqual(expect.objectContaining({ originalAuthor: 'Grace Hopper', revision: 2 }));
    expect(await publishAuditSince(slug, reattributing, 'novel.upsert')).toEqual([expect.objectContaining({ outcome: 'applied', incomingRevision: 2, storedRevision: 1 })]);

    expect((await publishForge(ctx, projectId, { originalAuthor: '   ' }))?.status).toBe('done');
    expect(await readServedNovel(slug)).toEqual(expect.objectContaining({ originalAuthor: null, revision: 3 }));
    expect(await servedAuthor()).toBeUndefined();

    expect((await publishForge(ctx, projectId, { originalAuthor: 'Grace Hopper' }))?.status).toBe('done');
    expect((await publishForge(ctx, projectId, { originalAuthor: null }))?.status).toBe('done');
    expect(await readServedNovel(slug)).toEqual(expect.objectContaining({ originalAuthor: null, revision: 5 }));
    expect(await servedAuthor()).toBeUndefined();
  });

  test('should bind the publish token on first sight and refuse a push carrying a different one', async ({ forge }) => {
    const publication = await forge.project('pub-token');
    const { ctx, projectId, slug } = publication;
    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Salt Road' }))?.status).toBe('done');
    const token = (await readForgePublication(projectId))?.publishToken ?? '';
    expect(/^[0-9a-f]{64}$/.test(token), 'the forge minted a publish token').toBe(true);
    expect((await readServedNovel(slug))?.publishToken === token, 'the reader bound the token the first push carried').toBe(true);

    expect((await reconcileSettled(publication)).novel).toBe('noop');
    expect((await readServedNovel(slug))?.publishToken === token, 'a matching resend keeps the binding').toBe(true);

    await updateServedNovel(slug, { publishToken: token.startsWith('0') ? 'f'.repeat(64) : '0'.repeat(64) });
    const held = await readServedNovel(slug);
    const pushing = await auditWatermark(slug);
    expect((await reconcileForge(publication)).ok(), 'the author is told the reader refused the push').toBe(false);
    expect(await readServedNovel(slug)).toEqual(held);
    expect(await publishAuditSince(slug, pushing, 'novel.upsert')).toEqual([
      expect.objectContaining({ outcome: 'unauthorized', incomingRevision: 1, callerClientId: FORGE_CLIENT_ID }),
    ]);

    await updateServedNovel(slug, { publishToken: null });
    expect((await publishForge(ctx, projectId, { blurb: 'A caravan crosses a desert of salt.' }))?.status).toBe('done');
    const rebound = await readServedNovel(slug);
    expect(rebound?.revision).toBe(2);
    expect(rebound?.publishToken === token, 'a tokenless novel binds the token its next applied push carries').toBe(true);
  });

  test('should create, skip, repush and replace chapters on the revision ladder, keeping each declared rating', async ({ forge }) => {
    const publication = await forge.project('pub-chapters', { chapters: true });
    const { ctx, projectId, slug } = publication;
    await reviseForgeChapter(projectId, 2, { contentRating: RATED });
    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast', violence: 'mild' }))?.status).toBe('done');
    for (const chapter of [1, 2]) await publishForgeChapter(ctx, projectId, chapter);
    await reconcileUntilConverged(ctx, projectId, [1, 2], []);

    const ledger = await readForgeLedger(projectId);
    const served = await readServedChapters(slug);
    expect(served.map(({ ordinal, revision, contentHash, contentRating }) => ({ ordinal, revision, contentHash, contentRating }))).toEqual([
      { ordinal: 1, revision: 1, contentHash: ledger[0]?.contentHash, contentRating: null },
      { ordinal: 2, revision: 1, contentHash: ledger[1]?.contentHash, contentRating: RATED },
    ]);
    expect(await publishAuditSince(slug, '0', 'chapter.upsert')).toEqual(
      expect.arrayContaining([1, 2].map(ordinal => expect.objectContaining({ ordinal, outcome: 'applied', incomingRevision: 1, storedRevision: null }))),
    );

    const idle = await auditWatermark(slug);
    const unchanged = await reconcileSettled(publication);
    expect(unchanged).toEqual(expect.objectContaining({ novel: 'noop', pushed: [], failed: [] }));
    expect(unchanged.skipped).toEqual(expect.arrayContaining([1, 2]));
    expect(await publishAuditSince(slug, idle, 'chapter.upsert'), 'an in-sync chapter is never sent again').toEqual([]);

    await rescheduleForgeChapter(projectId, 1);
    const repushing = await auditWatermark(slug);
    await reconcileSettled(publication);
    const repushed = await publishAuditSince(slug, repushing, 'chapter.upsert');
    expect(repushed.length, 'a push whose acknowledgement was lost is sent again').toBeGreaterThan(0);
    expect(repushed).toEqual(repushed.map(() => expect.objectContaining({ ordinal: 1, outcome: 'noop', incomingRevision: 1, storedRevision: 1 })));
    expect(await readServedChapters(slug)).toEqual(served);

    const revised = `${await readForgeChapterContent(projectId, 1)} The bell buoy rang once more, and then the sea was quiet.`;
    await reviseForgeChapter(projectId, 1, { content: revised });
    const revising = await auditWatermark(slug);
    await publishForgeChapter(ctx, projectId, 1);
    await reconcileUntilConverged(ctx, projectId, [1], []);
    const [republished] = await readForgeLedger(projectId);
    expect((await readServedChapters(slug))[0]).toEqual(expect.objectContaining({ ordinal: 1, content: revised, revision: 2, contentHash: republished?.contentHash }));
    expect(await publishAuditSince(slug, revising, 'chapter.upsert')).toEqual(
      expect.arrayContaining([expect.objectContaining({ ordinal: 1, outcome: 'applied', incomingRevision: 2, storedRevision: 1 })]),
    );

    await updateServedChapter(slug, 2, { content: 'A chapter the forge never sent.', contentHash: 'a'.repeat(64) });
    const healing = await auditWatermark(slug);
    expect((await reconcileSettled(publication)).pushed).toContain(2);
    expect((await readServedChapters(slug))[1], 'an equal revision carrying a different hash replaces the stored chapter').toEqual(served[1]);
    expect(await publishAuditSince(slug, healing, 'chapter.upsert')).toEqual([expect.objectContaining({ ordinal: 2, outcome: 'applied', incomingRevision: 1, storedRevision: 1 })]);
  });

  test('should refuse a stale chapter revision and never overwrite the newer reader copy', async ({ forge }) => {
    const publication = await forge.project('pub-chapter-stale', { chapters: true });
    const { ctx, projectId, slug } = publication;
    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast' }))?.status).toBe('done');
    await publishForgeChapter(ctx, projectId, 1);
    await reconcileUntilConverged(ctx, projectId, [1], []);

    await updateServedChapter(slug, 1, { revision: 9 });
    const [held] = await readServedChapters(slug);
    const revised = `${await readForgeChapterContent(projectId, 1)} Somewhere below the rail a gull cried out.`;
    await reviseForgeChapter(projectId, 1, { content: revised });
    const pushing = await auditWatermark(slug);
    await publishForgeChapter(ctx, projectId, 1);
    const retried = await reconcileSettled(publication);

    const staleError = expect.stringMatching(/^stale revision:/);
    expect(retried.failed).toEqual([{ ordinal: 1, error: staleError }]);
    expect((await readForgeLedger(projectId))[0]).toEqual(expect.objectContaining({ status: 'failed', revision: 2, error: staleError }));
    expect((await readServedChapters(slug))[0]).toEqual(held);
    const staleRow = expect.objectContaining({ ordinal: 1, outcome: 'stale_rejected', incomingRevision: 2, storedRevision: 9 });
    expect(await publishAuditSince(slug, pushing, 'chapter.upsert'), 'the publish and the reconcile retry are both refused').toEqual([staleRow, staleRow]);

    await updateServedChapter(slug, 1, { revision: 1 });
    expect((await reconcileSettled(publication)).pushed).toEqual([1]);
    expect((await readServedChapters(slug))[0]).toEqual(expect.objectContaining({ content: revised, revision: 2 }));
  });

  test('should delete an unpublished chapter from the reader once and leave ordinals the forge never published', async ({ forge }) => {
    const publication = await forge.project('pub-unpublish', { chapters: true });
    const { ctx, projectId, slug } = publication;
    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast' }))?.status).toBe('done');
    for (const chapter of [1, 2]) await publishForgeChapter(ctx, projectId, chapter);
    await reconcileUntilConverged(ctx, projectId, [1, 2], []);
    await insertServedChapter(slug, 9);
    const removed = (await readForgeLedger(projectId))[1];

    const unpublishing = await auditWatermark(slug);
    expect((await unpublishForgeChapter(ctx, projectId, 2))?.status).toBe('done');
    expect((await readServedChapters(slug)).map(chapter => chapter.ordinal)).toEqual([1, 9]);
    expect(await publishAuditSince(slug, unpublishing, 'chapter.unpublish')).toEqual([
      expect.objectContaining({ ordinal: 2, outcome: 'applied', contentHash: removed?.contentHash, storedRevision: 1 }),
    ]);
    expect((await forge.guest.get(`${readerUrl(slug)}/chapters/2`)).status()).toBe(404);

    const repeating = await auditWatermark(slug);
    const repeated = await reconcileSettled(publication);
    expect(repeated).toEqual(expect.objectContaining({ deleted: [], unknownOrdinals: [9], failed: [] }));
    expect(repeated.skipped).toContain(2);
    expect(await publishAuditSince(slug, repeating, 'chapter.unpublish'), 'a deleted ordinal is never deleted again').toEqual([]);
    expect((await readServedChapters(slug)).map(chapter => chapter.ordinal)).toEqual([1, 9]);
  });

  test('should rename the reader novel in place, chapters and wiki included, when the publication moves slug', async ({ forge }) => {
    const publication = await forge.project('pub-rename', { chapters: true });
    const { ctx, projectId, slug: first } = publication;
    await createEntity(ctx, projectId, KEEPER);
    expect((await publishForge(ctx, projectId, { novelSlug: first, title: 'The Quiet Coast' }))?.status).toBe('done');
    await publishForgeChapter(ctx, projectId, 1);
    await reconcileUntilConverged(ctx, projectId, [1], [KEEPER.entityKey]);
    const novel = await readServedNovel(first);
    const chapters = await readServedChapters(first);
    const wiki = await readServedWikiEntry(first, KEEPER.entityKey);
    expect(wiki).toBeDefined();

    const second = forge.slug('pub-renamed');
    expect((await publishForge(ctx, projectId, { novelSlug: second }))?.status).toBe('done');
    expect(await readServedNovelsByRef(FORGE_CLIENT_ID, projectId)).toEqual([expect.objectContaining({ id: novel?.id, slug: second, revision: 2 })]);
    expect(await readServedChapters(second)).toEqual(chapters);
    expect(await readServedWikiEntry(second, KEEPER.entityKey)).toEqual(wiki);
    expect(await publishAuditSince(second, '0', 'chapter.upsert'), 'moved chapters are not pushed again').toEqual([]);
    expect(await publishAuditSince(second, '0', 'wiki.upsert'), 'a moved wiki entry is not pushed again').toEqual([]);
    expect((await forge.guest.get(readerUrl(first))).status()).toBe(404);
    expect((await forge.guest.get(readerUrl(second))).status()).toBe(200);

    const third = forge.slug('pub-renamed-again');
    await updateServedNovel(second, { revision: 3 });
    expect((await publishForge(ctx, projectId, { novelSlug: third }))?.status).toBe('done');
    expect(await readServedNovelsByRef(FORGE_CLIENT_ID, projectId)).toEqual([expect.objectContaining({ id: novel?.id, slug: third, revision: 3 })]);
    expect(await publishAuditSince(third, '0', 'novel.upsert'), 'an equal-revision rename still applies').toEqual([
      expect.objectContaining({ outcome: 'applied', incomingRevision: 3, storedRevision: 3 }),
    ]);

    const fourth = forge.slug('pub-renamed-stale');
    await updateServedNovel(third, { revision: 50 });
    const held = await readServedNovel(third);
    expect((await publishForge(ctx, projectId, { novelSlug: fourth }))?.status, 'a rename behind the stored revision is refused').toBe('failed');
    expect(await readServedNovel(third)).toEqual(held);
    expect(await readServedNovel(fourth)).toBeUndefined();
    expect(await publishAuditSince(fourth, '0', 'novel.upsert')).toEqual([expect.objectContaining({ outcome: 'stale_rejected', incomingRevision: 4, storedRevision: 50 })]);

    await updateServedNovel(third, { revision: 3 });
    expect((await reconcileForge(publication)).status()).toBe(200);
    expect(await readServedNovelsByRef(FORGE_CLIENT_ID, projectId)).toEqual([expect.objectContaining({ id: novel?.id, slug: fourth, revision: 4 })]);
  });

  test("should refuse a push onto a slug the same publisher serves under another project's ref", async ({ forge }) => {
    const holder = await forge.project('pub-holder');
    const claimant = await forge.project('pub-claimant');
    const contested = holder.slug;
    expect((await publishForge(holder.ctx, holder.projectId, { novelSlug: contested, title: 'The Salt Road' }))?.status).toBe('done');
    const held = await readServedNovel(contested);

    const moved = forge.slug('pub-holder-moved');
    const claiming = await auditWatermark(contested);
    await holdPublishJob(holder.projectId);
    try {
      const move = await mutate(holder.ctx, 'post', `/api/v1/projects/${holder.projectId}/publish`, { data: { novelSlug: moved } });
      expect(move.status(), await move.text()).toBe(200);
      expect((await publishForge(claimant.ctx, claimant.projectId, { novelSlug: contested, title: 'The Salt Road' }))?.status).toBe('done');
    } finally {
      await releasePublishJob(holder.projectId);
    }

    expect(await readServedNovel(contested), 'the holder keeps its row').toEqual(held);
    expect(await publishAuditSince(contested, claiming, 'novel.upsert')).toEqual([
      expect.objectContaining({ outcome: 'unauthorized', incomingRevision: 1, callerClientId: FORGE_CLIENT_ID }),
    ]);
    const laddered = `${contested}-2`;
    expect((await readForgePublication(claimant.projectId))?.novelSlug).toBe(laddered);
    expect(await readServedNovelsByRef(FORGE_CLIENT_ID, claimant.projectId)).toEqual([expect.objectContaining({ slug: laddered })]);

    expect((await reconcileForge(holder)).status()).toBe(200);
    expect(await readServedNovelsByRef(FORGE_CLIENT_ID, holder.projectId)).toEqual([expect.objectContaining({ id: held?.id, slug: moved })]);
  });
});
