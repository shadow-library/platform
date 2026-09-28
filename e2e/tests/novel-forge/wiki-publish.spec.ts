/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, runAll, subFor, webNovelDb } from '../../lib';
import { expect, test } from '../web-novel/forge-fixtures';
import {
  type ForgePublication,
  publishForge,
  publishForgeChapter,
  readForgeWikiLedger,
  reconcileSettled,
  removeForgePublication,
  repeatForgeWikiPush,
  setForgeWikiVisibility,
} from '../web-novel/forge-publication';
import { auditWatermark, publishAuditSince, readServedWikiEntry, setServedWikiRevision } from '../web-novel/helpers';
import { expectImportLanded, startFinalImport } from './forge-bundles';
import { createEntity, type EntitySeed, pollWebNovel, reconcileUntilConverged, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface WikiIndex {
  items: { entryKey: string; type: string; name: string; imageUrl?: string }[];
  lockedCount: number;
}

interface WikiEntry {
  facets: { facetKey: string; content: string; sortOrder: number }[];
  images: unknown[];
  hiddenFacetCount: number;
}

/**
 * Declaring the constants
 *
 * The forge→reader wiki round-trip, AI-free. The novel-import bundle format carries NO wiki/entity content
 * (the bundle is metadata + volumes/chapters + a cover asset only), so the wiki is authored
 * through the forge bible API after import: entities (`POST /projects/:id/entities`) plus canon facts
 * (`PUT /projects/:id/facts/:key` + `POST .../reveal`). The reader wiki is a pure PROJECTION of that bible —
 * `WikiPublishingService.computeProjections` derives one spoiler-gated payload per visible entity from
 * entities + revealed canon facts + the PUBLISHED chapter→ordinal map, and `PublishRunner.converge` pushes it
 * (`PUT /internal/novels/:slug/wiki/:entryKey`) in the SAME pass that pushes chapters. So the wiki push is not
 * a separate step: it rides every publish-job converge and every `POST /publications/reconcile`.
 *
 * Convergence is driven here through `reconcile` (synchronous converge), NOT the auto-push jobs: publishing a
 * chapter while a converge job is already in flight is silently "deduped onto active job", so those chapters
 * would only settle on the janitor sweep — see `reconcileUntilConverged`.
 *
 * Gating design used here (both derived from published ordinals, no `firstSeenChapter` needed — the create DTO
 * does not even expose it):
 *   - `e2e-hero`  — has a `body`, so it projects a `profile` facet at ordinal 0 (its `firstSeenChapter` is
 *                   null → pre-story). Visible to a guest (gate 0).
 *   - `e2e-order` — has NO body/motivation/aliases, so it projects ONLY a fact facet. Its single canon fact is
 *                   revealed in chapter 2, so the facet — and thus the whole entry — is gated to ordinal 2.
 *                   Hidden from a guest (gate 0); visible once a reader's furthestOrdinal reaches 2.
 *
 * Serial: every step builds on the previous project's state.
 *
 * The second half reads web-novel's wiki ingest outcomes from its own tables, one project per test. A reader revision newer than the
 * forge's is written straight into the reader; the push that meets it is real. The ingest audit row names no entry key, so each step reads
 * the trail of one entry at a time. Out of reach this way: a wiki push for an unknown novel or under an end-user token, and a repeated
 * delete reaching the reader (the forge deletes only what the reader's wiki manifest still lists).
 */

const RED_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4oaEBAALUARkFUI+kAAAAAElFTkSuQmCC';
const BLUE_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQ0DgBAAGUARn8OyyYAAAAAElFTkSuQmCC';

const KEEPER: EntitySeed = { entityKey: 'e2e-keeper', type: 'character', name: 'Mira the Keeper', body: 'The keeper of the coast light for eleven winters.' };
const RIVAL: EntitySeed = { entityKey: 'e2e-rival', type: 'character', name: 'Odo the Assessor', body: 'A guild assessor who wants the coast light dark.' };

async function revealFact(publication: ForgePublication, factKey: string, text: string): Promise<void> {
  const { ctx, projectId } = publication;
  const fact = await mutate(ctx, 'put', `/api/v1/projects/${projectId}/facts/${factKey}`, { data: { text, subjects: [KEEPER.entityKey] } });
  expect(fact.status(), await fact.text()).toBe(200);
  const reveal = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/facts/${factKey}/reveal`, { data: { entityKey: KEEPER.entityKey, chapter: 1 } });
  expect(reveal.status(), await reveal.text()).toBe(200);
}

/** Adds a gallery image of the keeper dated before the story, and answers its id. */
async function addGalleryImage(publication: ForgePublication, image: string, caption: string): Promise<string> {
  const { ctx, projectId } = publication;
  const added = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/entities/${KEEPER.entityKey}/images`, { data: { mime: 'image/png', image, caption, depictsChapter: 0 } });
  expect(added.status(), await added.text()).toBe(201);
  const { images } = (await added.json()) as { images: { id: string; caption?: string | null }[] };
  const id = images.find(candidate => candidate.caption === caption)?.id;
  expect(id, `the gallery lists the image captioned ${caption}`).toBeDefined();
  return id ?? '';
}

const VISIBLE_KEY = 'e2e-hero';
const GATED_KEY = 'e2e-order';
const FACT_KEY = 'e2e-order-origin';

test.describe('novel-forge wiki publish → reader', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  const slug = `e2e-wiki-${uniqueSuffix()}`;
  const novelTitle = `E2E Wiki Novel ${uniqueSuffix()}`;
  let forgeCtx: APIRequestContext;
  let webGuestCtx: APIRequestContext;
  let webUser1Ctx: APIRequestContext;
  let projectId = '';

  test.beforeAll(async () => {
    forgeCtx = await apiContext('novelForge', 'user1');
    webGuestCtx = await apiContext('webNovel');
    webUser1Ctx = await apiContext('webNovel', 'user1');
  });

  test.afterAll(async () => {
    await runAll([() => removeForgePublication(forgeCtx, projectId, slug), () => forgeCtx.dispose(), () => webGuestCtx.dispose(), () => webUser1Ctx.dispose()]);
  });

  test('should import a final bundle with three chapters', async () => {
    const { projectId: pid, jobId } = await startFinalImport(forgeCtx, novelTitle);
    projectId = pid;
    expect(projectId).toMatch(/^[0-9]+$/);
    await expectImportLanded(jobId);

    const chapters = await forgeCtx.get(`/api/v1/projects/${projectId}/source/chapters`);
    expect(chapters.status()).toBe(200);
    const body = (await chapters.json()) as { items: { number: number }[] };
    expect(body.items.map(c => c.number)).toEqual(expect.arrayContaining([1, 2, 3]));
  });

  test('should author wiki content: a visible entity and a chapter-2-gated entity via a canon fact', async () => {
    // Visible entity — a `body` gives it a `profile` facet at ordinal 0 (pre-story), so a guest can read it.
    const hero = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/entities`, {
      data: {
        entityKey: VISIBLE_KEY,
        type: 'character',
        name: 'Mira the Keeper',
        body: 'The retired keeper of the Ashfall light, guardian of the flame for eleven winters.',
        significance: 'major',
      },
    });
    expect(hero.status(), await hero.text()).toBe(201);

    // Gated entity — deliberately NO body/motivation/aliases, so it projects ONLY the fact facet below.
    const order = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/entities`, {
      data: { entityKey: GATED_KEY, type: 'faction', name: 'The Tidewatch Order' },
    });
    expect(order.status(), await order.text()).toBe(201);

    // A canon fact whose SUBJECT is the gated entity — the projector attaches it as a facet on `e2e-order`.
    const fact = await mutate(forgeCtx, 'put', `/api/v1/projects/${projectId}/facts/${FACT_KEY}`, {
      data: { text: 'The Tidewatch Order has quietly kept the flame lit for three hundred years.', subjects: [GATED_KEY] },
    });
    expect(fact.status(), await fact.text()).toBe(200);

    // Reveal the fact in chapter 2 (learner = the hero) → the facet is stamped at chapter 2's published ordinal.
    const reveal = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/facts/${FACT_KEY}/reveal`, {
      data: { entityKey: VISIBLE_KEY, chapter: 2 },
    });
    expect(reveal.status(), await reveal.text()).toBe(200);
    const revealBody = (await reveal.json()) as { knowledge: { learnedInChapter: number }[] };
    expect(revealBody.knowledge.some(k => k.learnedInChapter === 2)).toBe(true);
  });

  test('should publish novel metadata (PUBLIC by default) under the chosen slug', async () => {
    const response = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/publish`, {
      data: { novelSlug: slug, title: novelTitle, genres: ['Fantasy'] },
    });
    expect(response.status(), await response.text()).toBe(200);
    expect((await response.json()).novelSlug).toBe(slug);
  });

  test('should publish all three chapters and converge chapters + wiki to the reader', async () => {
    for (const n of [1, 2, 3]) {
      const res = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/chapters/${n}/publish`, { data: {} });
      expect(res.status(), await res.text()).toBe(202);
    }

    const result = await reconcileUntilConverged(forgeCtx, projectId, [1, 2, 3], [VISIBLE_KEY, GATED_KEY]);
    expect(result.failed, `chapter push failures: ${JSON.stringify(result.failed)}`).toEqual([]);
    expect(result.wiki.failed, `wiki push failures: ${JSON.stringify(result.wiki.failed)}`).toEqual([]);
    const chaptersSettled = [...result.pushed, ...result.skipped];
    expect(chaptersSettled).toEqual(expect.arrayContaining([1, 2, 3]));
    const wikiSettled = [...result.wiki.pushed, ...result.wiki.skipped];
    expect(wikiSettled).toEqual(expect.arrayContaining([VISIBLE_KEY, GATED_KEY]));
  });

  test('should surface the published novel and its chapters on the reader', async () => {
    const detail = await pollWebNovel(webGuestCtx, `/api/novels/${slug}`, 200);
    expect(detail.status(), await detail.text()).toBe(200);
    const body = (await detail.json()) as { title: string; chapterCount: number; visibility: string };
    expect(body.title).toBe(novelTitle);
    expect(body.chapterCount).toBeGreaterThanOrEqual(3);
    expect(body.visibility).toBe('PUBLIC');
  });

  test('should list the visible entry for a guest and exclude the gated one', async () => {
    const response = await pollWebNovel(webGuestCtx, `/api/novels/${slug}/wiki`, 200);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as WikiIndex;
    const keys = body.items.map(i => i.entryKey);
    expect(keys).toContain(VISIBLE_KEY);
    expect(keys).not.toContain(GATED_KEY);
    expect(body.lockedCount).toBeGreaterThanOrEqual(1);
  });

  test('should return the visible entry with facets and 404 WBN_009 the gated one for a guest', async () => {
    const visible = await webGuestCtx.get(`/api/novels/${slug}/wiki/${VISIBLE_KEY}`);
    expect(visible.status(), await visible.text()).toBe(200);
    const visibleBody = (await visible.json()) as WikiEntry;
    expect(visibleBody.facets.length).toBeGreaterThanOrEqual(1);

    const gated = await webGuestCtx.get(`/api/novels/${slug}/wiki/${GATED_KEY}`);
    expect(gated.status()).toBe(404);
    expect((await gated.json()).code).toBe('WBN_009');
  });

  test('should reveal the gated entry once a reader progresses past its gate (furthestOrdinal >= 2)', async () => {
    // Before progress: user1 has never opened this novel, so gate = 0 and the gated entry is hidden.
    const before = await webUser1Ctx.get(`/api/novels/${slug}/wiki`);
    expect(before.status()).toBe(200);
    expect(((await before.json()) as WikiIndex).items.map(i => i.entryKey)).not.toContain(GATED_KEY);

    // Advance reading progress to ordinal 2 → gate = 2. Written straight to the reader DB rather than through
    // `PUT /api/novels/:slug/progress`: the shared `mutate` helper's CSRF read grabs the first `csrf-token`
    // cookie in a multi-app jar (novel-forge's, here), so the web-novel server rejects the double-submit with
    // 403 S010 — a known harness quirk the web-novel suite works around with a domain-scoped helper in its own
    // directory. `furthest_ordinal` is what the wiki gate reads, so seeding it directly exercises the gate itself.
    const sql = webNovelDb();
    const sub = subFor('user1');
    await sql`
      insert into reading_progress (user_id, novel_id, ordinal, position, furthest_ordinal, updated_at)
      select ${sub}, id, 2, 0, 2, now() from novels where slug = ${slug}
      on conflict (user_id, novel_id) do update set furthest_ordinal = greatest(reading_progress.furthest_ordinal, 2), ordinal = 2, updated_at = now()
    `;

    const index = await webUser1Ctx.get(`/api/novels/${slug}/wiki`);
    expect(((await index.json()) as WikiIndex).items.map(i => i.entryKey)).toContain(GATED_KEY);

    const entry = await webUser1Ctx.get(`/api/novels/${slug}/wiki/${GATED_KEY}`);
    expect(entry.status(), await entry.text()).toBe(200);
    expect(((await entry.json()) as WikiEntry).facets.length).toBeGreaterThanOrEqual(1);
  });

  test('should delete the forge project and observe the reader novel is NOT cascaded', async () => {
    const del = await mutate(forgeCtx, 'delete', `/api/v1/projects/${projectId}`);
    expect(del.status()).toBe(204);
    projectId = '';

    // The reader is a downstream projection with its own lifecycle: deleting the forge project does not
    // retract the published novel (there is no delete-novel push). It remains readable — an orphan the author
    // would retire explicitly. Observed, not asserted as desired behaviour.
    const stillThere = await webGuestCtx.get(`/api/novels/${slug}`);
    test.info().annotations.push({ type: 'reader after forge delete', description: `GET /api/novels/${slug} → ${stillThere.status()} (200 = orphaned, not cascaded)` });
  });
});

test.describe('web-novel wiki ingest through novel-forge', () => {
  test.describe.configure({ timeout: 120_000 });

  test('should create, skip, repush and wholly replace a wiki entry on the revision ladder', async ({ forge }) => {
    const publication = await forge.project('wiki-ladder', { chapters: true });
    const { ctx, projectId, slug } = publication;
    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast' }))?.status).toBe('done');
    await publishForgeChapter(ctx, projectId, 1);
    await reconcileUntilConverged(ctx, projectId, [1], []);

    await createEntity(ctx, projectId, KEEPER);
    await revealFact(publication, 'e2e-keeper-oath', 'Mira swore an oath to the flame on her first night in the tower.');
    const portrait = await addGalleryImage(publication, RED_PIXEL, 'Before the story');
    await reconcileUntilConverged(ctx, projectId, [1], [KEEPER.entityKey]);

    const [ledgered] = await readForgeWikiLedger(projectId);
    expect(ledgered).toEqual(expect.objectContaining({ entryKey: KEEPER.entityKey, state: 'pushed', revision: 1 }));
    const served = await readServedWikiEntry(slug, KEEPER.entityKey);
    expect(served).toEqual(expect.objectContaining({ revision: 1, contentHash: ledgered?.contentHash }));
    expect(served?.facets.map(facet => [facet.facetKey, facet.visibleFromOrdinal])).toEqual([
      ['profile', 0],
      ['fact:e2e-keeper-oath', 1],
    ]);
    expect(served?.images).toEqual([{ imageRef: expect.any(String), caption: 'Before the story' }]);
    const created = (await publishAuditSince(slug, '0', 'wiki.upsert')).filter(row => row.outcome !== 'noop');
    expect(created).toEqual([expect.objectContaining({ outcome: 'applied', incomingRevision: 1, storedRevision: null, contentHash: ledgered?.contentHash })]);

    const idle = await auditWatermark(slug);
    const unchanged = await reconcileSettled(publication);
    expect(unchanged.wiki).toEqual(expect.objectContaining({ pushed: [], skipped: [KEEPER.entityKey], failed: [] }));
    expect(await publishAuditSince(slug, idle, 'wiki.upsert'), 'an in-sync entry is never sent again').toEqual([]);

    await repeatForgeWikiPush(projectId, KEEPER.entityKey);
    const repushing = await auditWatermark(slug);
    await reconcileSettled(publication);
    const repushed = await publishAuditSince(slug, repushing, 'wiki.upsert');
    expect(repushed.length, 'a push whose acknowledgement was lost is sent again').toBeGreaterThan(0);
    expect(repushed).toEqual(repushed.map(() => expect.objectContaining({ outcome: 'noop', incomingRevision: 1, storedRevision: 1 })));
    expect(await readServedWikiEntry(slug, KEEPER.entityKey)).toEqual(served);

    await setServedWikiRevision(slug, KEEPER.entityKey, 2);
    const retracted = await mutate(ctx, 'delete', `/api/v1/projects/${projectId}/facts/e2e-keeper-oath`);
    expect(retracted.ok(), await retracted.text()).toBe(true);
    await revealFact(publication, 'e2e-keeper-vow', 'Mira vowed never to let the tide take the flame.');
    const removed = await mutate(ctx, 'delete', `/api/v1/projects/${projectId}/entities/${KEEPER.entityKey}/images/${portrait}`);
    expect(removed.status(), await removed.text()).toBe(200);
    await addGalleryImage(publication, BLUE_PIXEL, 'As of the story');
    const replacing = await auditWatermark(slug);
    expect((await reconcileSettled(publication)).wiki.pushed).toEqual([KEEPER.entityKey]);

    const [relisted] = await readForgeWikiLedger(projectId);
    const replaced = await readServedWikiEntry(slug, KEEPER.entityKey);
    expect(replaced).toEqual(expect.objectContaining({ id: served?.id, revision: 2, contentHash: relisted?.contentHash }));
    expect(
      replaced?.facets.map(facet => facet.facetKey),
      'an equal-revision push replaces the facet set rather than merging it',
    ).toEqual(['profile', 'fact:e2e-keeper-vow']);
    expect(replaced?.images).toEqual([{ imageRef: expect.any(String), caption: 'As of the story' }]);
    expect(replaced?.images[0]?.imageRef).not.toBe(served?.images[0]?.imageRef);
    expect(await publishAuditSince(slug, replacing, 'wiki.upsert')).toEqual([expect.objectContaining({ outcome: 'applied', incomingRevision: 2, storedRevision: 2 })]);
  });

  test('should refuse a stale wiki revision and leave the stored entry untouched', async ({ forge }) => {
    const publication = await forge.project('wiki-stale');
    const { ctx, projectId, slug } = publication;
    await createEntity(ctx, projectId, KEEPER);
    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast' }))?.status).toBe('done');
    expect(await readServedWikiEntry(slug, KEEPER.entityKey)).toEqual(expect.objectContaining({ revision: 1 }));

    await setServedWikiRevision(slug, KEEPER.entityKey, 9);
    const held = await readServedWikiEntry(slug, KEEPER.entityKey);
    const body = 'The keeper of the coast light, and of its oldest secret.';
    const edited = await mutate(ctx, 'patch', `/api/v1/projects/${projectId}/entities/${KEEPER.entityKey}`, { data: { body } });
    expect(edited.status(), await edited.text()).toBe(200);
    const pushing = await auditWatermark(slug);
    const refused = await reconcileSettled(publication);

    const staleError = expect.stringMatching(/^stale revision:/);
    expect(refused.wiki.failed).toEqual([{ entryKey: KEEPER.entityKey, error: staleError }]);
    expect(await readForgeWikiLedger(projectId)).toEqual([expect.objectContaining({ entryKey: KEEPER.entityKey, state: 'failed', revision: 2, error: staleError })]);
    expect(await readServedWikiEntry(slug, KEEPER.entityKey)).toEqual(held);
    expect(await publishAuditSince(slug, pushing, 'wiki.upsert')).toEqual([expect.objectContaining({ outcome: 'stale_rejected', incomingRevision: 2, storedRevision: 9 })]);

    await setServedWikiRevision(slug, KEEPER.entityKey, 1);
    expect((await reconcileSettled(publication)).wiki.pushed).toEqual([KEEPER.entityKey]);
    expect(await readServedWikiEntry(slug, KEEPER.entityKey)).toEqual(
      expect.objectContaining({ revision: 2, facets: [expect.objectContaining({ facetKey: 'profile', content: body })] }),
    );
  });

  test('should delete a removed or hidden entity from the reader once, and restore a hidden one shown again', async ({ forge }) => {
    const publication = await forge.project('wiki-delete');
    const { ctx, projectId, slug } = publication;
    await createEntity(ctx, projectId, KEEPER);
    await createEntity(ctx, projectId, RIVAL);
    expect((await publishForge(ctx, projectId, { novelSlug: slug, title: 'The Quiet Coast' }))?.status).toBe('done');
    const pushed = await readForgeWikiLedger(projectId);
    expect(pushed.map(row => [row.entryKey, row.state])).toEqual([
      [KEEPER.entityKey, 'pushed'],
      [RIVAL.entityKey, 'pushed'],
    ]);
    const hashOf = (entryKey: string): string | undefined => pushed.find(row => row.entryKey === entryKey)?.contentHash;
    const servedKeys = async (): Promise<string[]> => ((await (await forge.guest.get(`/api/novels/${slug}/wiki`)).json()) as WikiIndex).items.map(item => item.entryKey);

    const deleting = await auditWatermark(slug);
    expect((await mutate(ctx, 'delete', `/api/v1/projects/${projectId}/entities/${KEEPER.entityKey}`)).status()).toBe(204);
    expect((await reconcileSettled(publication)).wiki).toEqual(expect.objectContaining({ deleted: [KEEPER.entityKey], failed: [] }));
    expect(await readServedWikiEntry(slug, KEEPER.entityKey)).toBeUndefined();
    expect(await servedKeys()).toEqual([RIVAL.entityKey]);
    expect((await forge.guest.get(`/api/novels/${slug}/wiki/${KEEPER.entityKey}`)).status()).toBe(404);
    expect(await publishAuditSince(slug, deleting, 'wiki.delete')).toEqual([
      expect.objectContaining({ outcome: 'applied', contentHash: hashOf(KEEPER.entityKey), storedRevision: 1 }),
    ]);
    expect(await readForgeWikiLedger(projectId)).toEqual(expect.arrayContaining([expect.objectContaining({ entryKey: KEEPER.entityKey, state: 'deleted' })]));

    const repeating = await auditWatermark(slug);
    const repeated = await reconcileSettled(publication);
    expect(repeated.wiki).toEqual(expect.objectContaining({ deleted: [], failed: [] }));
    expect(repeated.wiki.skipped).toContain(KEEPER.entityKey);
    expect(await publishAuditSince(slug, repeating, 'wiki.delete'), 'a tombstoned entry is never deleted again').toEqual([]);

    const hiding = await auditWatermark(slug);
    await setForgeWikiVisibility(projectId, RIVAL.entityKey, 'hidden');
    expect((await reconcileSettled(publication)).wiki).toEqual(expect.objectContaining({ deleted: [RIVAL.entityKey], failed: [] }));
    expect(await readServedWikiEntry(slug, RIVAL.entityKey)).toBeUndefined();
    expect(await servedKeys()).toEqual([]);
    expect(await readForgeWikiLedger(projectId), 'hiding tombstones the ledger row').toEqual(
      expect.arrayContaining([expect.objectContaining({ entryKey: RIVAL.entityKey, state: 'deleted' })]),
    );
    expect(await publishAuditSince(slug, hiding, 'wiki.delete')).toEqual([
      expect.objectContaining({ outcome: 'applied', contentHash: hashOf(RIVAL.entityKey), storedRevision: 1 }),
    ]);
    const rehiding = await auditWatermark(slug);
    expect((await reconcileSettled(publication)).wiki.deleted).toEqual([]);
    expect(await publishAuditSince(slug, rehiding, 'wiki.delete'), 'a hidden entry is never deleted again').toEqual([]);

    const showing = await auditWatermark(slug);
    await setForgeWikiVisibility(projectId, RIVAL.entityKey, 'default');
    expect((await reconcileSettled(publication)).wiki.pushed).toEqual([RIVAL.entityKey]);
    expect(await readServedWikiEntry(slug, RIVAL.entityKey)).toEqual(expect.objectContaining({ revision: 2, contentHash: hashOf(RIVAL.entityKey) }));
    expect(await readForgeWikiLedger(projectId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ entryKey: RIVAL.entityKey, state: 'pushed', revision: 2, contentHash: hashOf(RIVAL.entityKey) })]),
    );
    expect(await servedKeys()).toEqual([RIVAL.entityKey]);
    expect(await publishAuditSince(slug, showing, 'wiki.upsert')).toEqual([expect.objectContaining({ outcome: 'applied', incomingRevision: 2, storedRevision: null })]);
  });
});
