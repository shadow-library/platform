/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { mutate, pollUntil } from '../../lib';
import {
  FORGE_CLIENT_ID,
  type ForgeChapterLedgerRow,
  type ForgePublication,
  publishForge,
  publishForgeChapter,
  readForgeLedger,
  readForgePublication,
  readPublishJob,
  reconcileForge,
  reconcileSettled,
  rescheduleForgeChapter,
  reviseForgeChapter,
  settlePublishJob,
} from '../web-novel/forge-publication';
import { readServedChapters, readServedNovel, readServedNovelsByRef, readServedWikiEntries } from '../web-novel/helpers';
import { type ForgeActor } from './forge-actors';
import { expectCode } from './forge-arrange';
import { buildBundle, expect, ladderSlugs, type PublishingLane, reassignServedPublisher, test, wipeServedNovel, writePublicationVocabulary } from './forge-bundles';
import { createEntity, type EntitySeed, reconcileUntilConverged, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The converge that carries the forge's ledger to the reader, read from both sides: what the reader stores after a push, and what the forge
 * ledgers about it. Reader states the forge never produces — a novel another publisher serves, a slug whose owner rotated, a wiped reader —
 * are written straight into web-novel's tables, and the push that meets them is real. The janitor sweeps once a minute (publication.janitor.ts:21);
 * a sweep is proven to have run by a chapter it released, never by waiting out the clock.
 */

const KEEPER: EntitySeed = { entityKey: 'e2e-keeper', type: 'character', name: 'Mira the Keeper', body: 'The keeper of the coast light for eleven winters.' };

const SWEEP_TIMEOUT_MS = 150_000;

const FAR_FUTURE = '2031-01-01T00:00:00.000Z';

async function importedPublication(lane: PublishingLane, owner: ForgeActor, label: string, chapters = 3): Promise<ForgePublication> {
  const { projectId } = await lane.imported(owner, buildBundle({ title: `E2E ${label} ${uniqueSuffix()}`, volumes: [{ title: 'The Quiet Coast', chapters }] }));
  return { ctx: owner.ctx, projectId, slug: lane.slug(label) };
}

async function ledgerRow(projectId: string, chapter: number): Promise<ForgeChapterLedgerRow | undefined> {
  return (await readForgeLedger(projectId)).find(row => row.chapter === chapter);
}

/** Waits for the janitor to release `chapter`, which only a sweep does for a row scheduled into the future. */
async function awaitSweptRelease(projectId: string, chapter: number): Promise<ForgeChapterLedgerRow | undefined> {
  return pollUntil(
    () => ledgerRow(projectId, chapter),
    row => row?.status === 'published',
    { timeoutMs: SWEEP_TIMEOUT_MS, intervalMs: 2_000 },
  );
}

async function scheduleSoon(owner: ForgeActor, projectId: string, chapter: number, inMs: number): Promise<void> {
  const response = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/chapters/${chapter}/publish`, {
    data: { scheduledAt: new Date(Date.now() + inMs).toISOString() },
  });
  expect(response.status(), await response.text()).toBe(202);
}

test.describe('novel-forge publish converge', () => {
  test('should push catalog vocabulary and ratings, repush a tag- or rating-only change, and drop stored vocabulary the reader would refuse', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'conv-catalog' });
    const projectId = await lane.project(owner, 'catalog');
    const slug = lane.slug('conv-catalog');
    const saved = (body: Record<string, unknown>): Promise<unknown> => publishForge(owner.ctx, projectId, body).then(job => expect(job?.status).toBe('done'));

    await saved({ novelSlug: slug, title: 'The Quiet Coast', genres: ['Fantasy'], tags: ['Female Protagonist'], violence: 'mild', darkContent: 'heavy' });
    expect(await readServedNovel(slug)).toEqual(
      expect.objectContaining({ genres: ['Fantasy'], tags: ['Female Protagonist'], sexualContent: null, violence: 'mild', darkContent: 'heavy', revision: 1 }),
    );

    await saved({ tags: ['Female Protagonist', 'Weak to Strong'] });
    expect(await readServedNovel(slug)).toEqual(expect.objectContaining({ tags: ['Female Protagonist', 'Weak to Strong'], revision: 2 }));
    await saved({ violence: 'graphic' });
    expect(await readServedNovel(slug)).toEqual(expect.objectContaining({ violence: 'graphic', revision: 3 }));
    await saved({ violence: null });
    expect(await readServedNovel(slug), 'a nulled rating goes out unrated; an omitted one stands').toEqual(
      expect.objectContaining({ violence: null, darkContent: 'heavy', revision: 4 }),
    );

    await writePublicationVocabulary(projectId, ['Fantasy', 'Fantasy', 'Space Western'], ['Weak to Strong', 'Not A Tag']);
    const repushed = await reconcileSettled({ ctx: owner.ctx, projectId, slug });
    expect(repushed.novel, 'the push goes out rather than failing on the stored vocabulary').toBe('applied');
    expect(await readServedNovel(slug)).toEqual(expect.objectContaining({ genres: ['Fantasy'], tags: ['Weak to Strong'], revision: 5 }));
  });

  test('should push reader-clean chapters and ledger each one published with its hash and time', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'conv-payload' });
    const publication = await importedPublication(lane, owner, 'conv-payload');
    const { projectId, slug } = publication;
    await reviseForgeChapter(projectId, 2, { title: null, note: '   ' });
    await reviseForgeChapter(projectId, 3, { note: '  A word from the keeper.  ' });

    expect((await publishForge(owner.ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast' }))?.status).toBe('done');
    for (const chapter of [1, 2, 3]) await publishForgeChapter(owner.ctx, projectId, chapter);
    await reconcileUntilConverged(owner.ctx, projectId, [1, 2, 3], []);

    const ledger = await readForgeLedger(projectId);
    expect(ledger.map(row => [row.status, row.error, row.publishedAt instanceof Date])).toEqual([
      ['published', null, true],
      ['published', null, true],
      ['published', null, true],
    ]);
    const served = await readServedChapters(slug);
    expect(served.map(({ ordinal, title, authorNote, contentRating, revision }) => ({ ordinal, title, authorNote, contentRating, revision }))).toEqual([
      { ordinal: 1, title: 'Chapter 1: The Watch', authorNote: null, contentRating: null, revision: 1 },
      { ordinal: 2, title: 'Chapter 2', authorNote: null, contentRating: null, revision: 1 },
      { ordinal: 3, title: 'Chapter 3: The Watch', authorNote: 'A word from the keeper.', contentRating: null, revision: 1 },
    ]);
    expect(served.map(row => row.contentHash)).toEqual(ledger.map(row => row.contentHash));
  });

  test('should rebuild byte-identical chapters and wiki from the ledger after the reader loses the novel', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'conv-rebuild' });
    const publication = await importedPublication(lane, owner, 'conv-rebuild');
    const { projectId, slug } = publication;
    await createEntity(owner.ctx, projectId, KEEPER);
    await reviseForgeChapter(projectId, 2, { contentRating: { violence: 'mild' } });
    expect((await publishForge(owner.ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast', violence: 'mild' }))?.status).toBe('done');
    for (const chapter of [1, 2]) await publishForgeChapter(owner.ctx, projectId, chapter);
    await reconcileUntilConverged(owner.ctx, projectId, [1, 2], [KEEPER.entityKey]);

    const catalog = await readServedNovel(slug);
    const chapters = await readServedChapters(slug);
    const wiki = await readServedWikiEntries(slug);
    expect(chapters.map(row => row.ordinal)).toEqual([1, 2]);
    expect(wiki.map(row => row.entryKey)).toEqual([KEEPER.entityKey]);

    await wipeServedNovel(slug);
    const rebuilt = await reconcileSettled(publication);
    expect(rebuilt).toEqual(expect.objectContaining({ novel: 'applied', pushed: [1, 2], failed: [] }));
    expect(rebuilt.wiki).toEqual(expect.objectContaining({ pushed: [KEEPER.entityKey], failed: [] }));
    const rebuiltCatalog = await readServedNovel(slug);
    expect(rebuiltCatalog?.id, 'the catalog comes back as a new row').not.toBe(catalog?.id);
    expect(rebuiltCatalog).toEqual({ ...catalog, id: expect.any(String), updatedAt: expect.any(Date) });
    expect(await readServedChapters(slug), 'every chapter comes back byte for byte').toEqual(chapters.map(row => ({ ...row, id: expect.any(String) })));
    expect(await readServedWikiEntries(slug)).toEqual(wiki.map(row => ({ ...row, id: expect.any(String) })));
  });

  test('should refuse to push prose that drifted after the publish decision until the chapter is republished', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'conv-drift' });
    const publication = await importedPublication(lane, owner, 'conv-drift');
    const { projectId, slug } = publication;
    expect((await publishForge(owner.ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast' }))?.status).toBe('done');
    await publishForgeChapter(owner.ctx, projectId, 1);
    await reconcileUntilConverged(owner.ctx, projectId, [1], []);
    const [held] = await readServedChapters(slug);

    const revised = 'Mira climbed the stair one final time and put out the flame.';
    await reviseForgeChapter(projectId, 1, { content: revised });
    await rescheduleForgeChapter(projectId, 1);
    const refused = await reconcileSettled(publication);
    const drift = 'canonical prose changed since this publish was decided — republish chapter 1';
    expect(refused.failed).toEqual([{ ordinal: 1, error: drift }]);
    expect(await ledgerRow(projectId, 1)).toEqual(expect.objectContaining({ status: 'failed', error: drift, revision: 1 }));
    expect(await readServedChapters(slug), 'the reader keeps the prose the author published').toEqual([held]);

    await publishForgeChapter(owner.ctx, projectId, 1);
    await reconcileUntilConverged(owner.ctx, projectId, [1], []);
    expect(await ledgerRow(projectId, 1)).toEqual(expect.objectContaining({ status: 'published', error: null, revision: 2 }));
    expect((await readServedChapters(slug))[0]).toEqual(expect.objectContaining({ content: revised, revision: 2 }));
  });
});

test.describe('novel-forge publish converge onto foreign slugs', () => {
  test('should ladder past a slug another publisher serves and push under the first free rung', async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'conv-foreign' });
    const projectId = await lane.project(owner, 'foreign');
    const slug = lane.slug('conv-foreign');
    const [, second] = ladderSlugs(slug);
    await lane.foreignNovel(slug);
    const foreign = await readServedNovel(slug);

    expect((await publishForge(owner.ctx, projectId, { novelSlug: slug, title: 'The Salt Road' }))?.status).toBe('done');
    expect((await readForgePublication(projectId))?.novelSlug).toBe(second);
    expect(await readServedNovelsByRef(FORGE_CLIENT_ID, projectId)).toEqual([expect.objectContaining({ slug: second, sourceRef: projectId, revision: 1 })]);
    expect(await readServedNovel(slug), "the other publisher's novel is untouched").toEqual(foreign);
  });

  test('should give up after five foreign rungs, roll the slug back and ledger a failure the janitor never retries', async ({ forge, lane }) => {
    test.setTimeout(SWEEP_TIMEOUT_MS + 120_000);
    const owner = await forge.actor({ label: 'conv-exhausted' });
    const publication = await importedPublication(lane, owner, 'conv-exhausted');
    const { projectId, slug } = publication;
    for (const rung of ladderSlugs(slug)) await lane.foreignNovel(rung);

    const metadata = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/publish`, { data: { novelSlug: slug, title: 'The Salt Road' } });
    expect(metadata.status(), await metadata.text()).toBe(200);
    expect((await settlePublishJob(projectId))?.status).toBe('failed');
    expect((await publishForgeChapter(owner.ctx, projectId, 1))?.status).toBe('failed');

    const exhausted = await ledgerRow(projectId, 1);
    expect(exhausted).toEqual(expect.objectContaining({ status: 'failed', error: expect.stringMatching(/^slug unassignable: /) }));
    expect((await readForgePublication(projectId))?.novelSlug, 'the spent ladder rolls the slug back').toBe(slug);
    expect(await readServedNovelsByRef(FORGE_CLIENT_ID, projectId), 'nothing was pushed under any rung').toEqual([]);
    await expectCode(await reconcileForge(publication), 500, 'PUB_004', 'a reconcile against the spent ladder');
    const settled = { row: await ledgerRow(projectId, 1), job: await readPublishJob(projectId) };

    const sentinel = await importedPublication(lane, owner, 'conv-sentinel', 1);
    expect((await publishForge(owner.ctx, sentinel.projectId, { novelSlug: sentinel.slug, title: 'The Sentinel' }))?.status).toBe('done');
    await scheduleSoon(owner, sentinel.projectId, 1, 3_000);
    expect((await awaitSweptRelease(sentinel.projectId, 1))?.status, 'a sweep ran').toBe('published');
    expect({ row: await ledgerRow(projectId, 1), job: await readPublishJob(projectId) }, 'the sweep left the exhausted project alone').toEqual(settled);

    const own = lane.slug('conv-exhausted-own');
    expect((await publishForge(owner.ctx, projectId, { novelSlug: own }))?.status, 'an explicit free slug is the way out').toBe('done');
    await reconcileUntilConverged(owner.ctx, projectId, [1], []);
    expect(await readServedNovelsByRef(FORGE_CLIENT_ID, projectId)).toEqual([expect.objectContaining({ slug: own })]);
  });

  test("should ladder onto a second reader novel when a converged slug's owner changes underneath it", async ({ forge, lane }) => {
    const owner = await forge.actor({ label: 'conv-rotated' });
    const publication = await importedPublication(lane, owner, 'conv-rotated');
    const { projectId, slug } = publication;
    const [, second] = ladderSlugs(slug);
    expect((await publishForge(owner.ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast' }))?.status).toBe('done');
    await publishForgeChapter(owner.ctx, projectId, 1);
    await reconcileUntilConverged(owner.ctx, projectId, [1], []);
    const original = await readServedNovel(slug);
    const originalChapters = await readServedChapters(slug);

    await reassignServedPublisher(slug, 'e2e-seed');
    const moved = await reconcileSettled(publication);
    expect(moved).toEqual(expect.objectContaining({ novel: 'applied', pushed: [1], failed: [] }));
    expect((await readForgePublication(projectId))?.novelSlug).toBe(second);
    const [laddered] = await readServedNovelsByRef(FORGE_CLIENT_ID, projectId);
    expect(laddered).toEqual(expect.objectContaining({ slug: second, sourceRef: projectId }));
    expect(laddered?.id, 'a second novel, not the original recovered').not.toBe(original?.id);
    expect((await readServedChapters(second as string)).map(row => row.contentHash)).toEqual(originalChapters.map(row => row.contentHash));
    expect(await readServedNovel(slug), 'the original is left where it was, no longer addressable by the forge').toEqual(
      expect.objectContaining({ id: original?.id, sourceClientId: 'e2e-seed' }),
    );
    expect(await readServedChapters(slug)).toEqual(originalChapters);
  });
});

test.describe('novel-forge publication janitor', () => {
  test('should release a due scheduled chapter through a real publish job and leave a future one and an idle project alone', async ({ forge, lane }) => {
    test.setTimeout(SWEEP_TIMEOUT_MS + 120_000);
    const owner = await forge.actor({ label: 'conv-janitor' });
    const idle = await importedPublication(lane, owner, 'conv-idle', 1);
    expect((await publishForge(owner.ctx, idle.projectId, { novelSlug: idle.slug, title: 'The Idle Coast' }))?.status).toBe('done');
    const future = await mutate(owner.ctx, 'post', `/api/v1/projects/${idle.projectId}/chapters/1/publish`, { data: { scheduledAt: FAR_FUTURE } });
    expect(future.status(), await future.text()).toBe(202);
    const idleJob = await readPublishJob(idle.projectId);

    const due = await importedPublication(lane, owner, 'conv-due', 2);
    expect((await publishForge(owner.ctx, due.projectId, { novelSlug: due.slug, title: 'The Due Coast' }))?.status).toBe('done');
    const before = await readPublishJob(due.projectId);
    await scheduleSoon(owner, due.projectId, 1, 10_000);
    const later = await mutate(owner.ctx, 'post', `/api/v1/projects/${due.projectId}/chapters/2/publish`, { data: { scheduledAt: FAR_FUTURE } });
    expect(later.status(), await later.text()).toBe(202);
    expect(await readPublishJob(due.projectId), 'scheduling enqueues nothing').toEqual(before);

    const released = await awaitSweptRelease(due.projectId, 1);
    expect(released).toEqual(expect.objectContaining({ status: 'published', error: null, publishedAt: expect.any(Date) }));
    const job = await readPublishJob(due.projectId);
    expect(job?.status, 'the release ran through the publish job').toBe('done');
    expect(job?.updatedAt.getTime()).toBeGreaterThan(before?.updatedAt.getTime() ?? 0);
    expect((await ledgerRow(due.projectId, 2))?.status).toBe('scheduled');
    expect((await readServedChapters(due.slug)).map(row => row.ordinal)).toEqual([1]);

    expect(await readPublishJob(idle.projectId), 'a sweep with nothing due for a project enqueues nothing for it').toEqual(idleJob);
    expect((await ledgerRow(idle.projectId, 1))?.status).toBe('scheduled');
  });
});
