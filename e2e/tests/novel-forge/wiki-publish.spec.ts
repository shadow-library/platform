/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, pollJob, subFor, webNovelDb } from '../../lib';
import { buildFinalBundle, deleteProjectQuietly, uniqueSuffix } from './forge-helpers';

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

interface ReconcileResult {
  novel: string;
  pushed: number[];
  skipped: number[];
  failed: { ordinal: number; error: string }[];
  wiki: { pushed: string[]; skipped: string[]; failed: { entryKey: string; error: string }[] };
}

/**
 * Declaring the constants
 *
 * The forge→reader wiki round-trip, AI-free. The novel-import bundle format carries NO wiki/entity content
 * (docs/novel-import-format.md is metadata + volumes/chapters + a cover asset only), so the wiki is authored
 * through the forge bible API after import: entities (`POST /projects/:id/entities`) plus canon facts
 * (`PUT /projects/:id/facts/:key` + `POST .../reveal`). The reader wiki is a pure PROJECTION of that bible —
 * `WikiPublishingService.computeProjections` derives one spoiler-gated payload per visible entity from
 * entities + revealed canon facts + the PUBLISHED chapter→ordinal map, and `PublishRunner.converge` pushes it
 * (`PUT /internal/novels/:slug/wiki/:entryKey`) in the SAME pass that pushes chapters. So the wiki push is not
 * a separate step: it rides every publish-job converge and every `POST /publications/reconcile`.
 *
 * Convergence is driven here through `reconcile` (synchronous converge), NOT the auto-push jobs: publishing a
 * chapter while a converge job is already in flight is silently "deduped onto active job", so those chapters
 * would only settle on the janitor sweep — see the note on `reconcileUntilConverged` below.
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
 */

test.describe.configure({ mode: 'serial', timeout: 150_000 });

const VISIBLE_KEY = 'e2e-hero';
const GATED_KEY = 'e2e-order';
const FACT_KEY = 'e2e-order-origin';

/** Polls a web-novel GET until it returns `wantStatus`, so an in-flight reader push has time to arrive. */
async function pollWebNovel(ctx: APIRequestContext, path: string, wantStatus: number, timeoutMs = 45_000): Promise<APIResponse> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await ctx.get(path);
    if (response.status() === wantStatus) return response;
    if (Date.now() >= deadline) return response;
    await new Promise(r => setTimeout(r, 2_000));
  }
}

/**
 * Repeatedly calls the synchronous `reconcile` endpoint until every chapter and every wanted wiki entry has
 * settled (pushed or already-in-sync skipped) with no failures. Reconcile is the deterministic converge trigger:
 * the low-latency auto-push job dedups concurrent enqueues, so a chapter published during an in-flight converge
 * never gets its own push and lingers `scheduled` — reconcile forces the full manifest-diff converge that pushes
 * it. In one pass reconcile pushes the due chapters (marking them `published`) and THEN recomputes the wiki off
 * those just-updated ordinals, so the gated entry appears as soon as its gating chapter is live.
 */
async function reconcileUntilConverged(ctx: APIRequestContext, projectId: string, wantChapters: number[], wantWiki: string[], timeoutMs = 90_000): Promise<ReconcileResult> {
  const deadline = Date.now() + timeoutMs;
  let last: ReconcileResult = { novel: '', pushed: [], skipped: [], failed: [], wiki: { pushed: [], skipped: [], failed: [] } };
  for (;;) {
    const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/publications/reconcile`);
    if (response.status() === 200) {
      last = (await response.json()) as ReconcileResult;
      const chaptersSettled = new Set([...last.pushed, ...last.skipped]);
      const wikiSettled = new Set([...last.wiki.pushed, ...last.wiki.skipped]);
      const converged = last.failed.length === 0 && last.wiki.failed.length === 0 && wantChapters.every(o => chaptersSettled.has(o)) && wantWiki.every(k => wikiSettled.has(k));
      if (converged) return last;
    }
    if (Date.now() >= deadline) return last;
    await new Promise(r => setTimeout(r, 3_000));
  }
}

test.describe('novel-forge wiki publish → reader', () => {
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
    if (projectId) await deleteProjectQuietly(forgeCtx, projectId);
    await forgeCtx.dispose();
    await webGuestCtx.dispose();
    await webUser1Ctx.dispose();
  });

  test('should import a final bundle with three chapters', async () => {
    const importRes = await mutate(forgeCtx, 'post', '/api/v1/import', { data: { bundle: buildFinalBundle(novelTitle) } });
    expect(importRes.status(), await importRes.text()).toBe(202);
    const { projectId: pid, jobId } = (await importRes.json()) as { projectId: string; jobId: string };
    projectId = pid;
    expect(projectId).toMatch(/^[0-9]+$/);

    const job = await pollJob<{ status: string; lastError?: string }>(forgeCtx, jobId, { timeoutMs: 60_000 });
    expect(job.status, `import job failed: ${job.lastError ?? ''}`).toBe('done');

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
      data: { novelSlug: slug, title: novelTitle, genres: ['fantasy', 'slow-burn'] },
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

    console.log(`[wiki-publish] after forge project delete, reader GET /api/novels/${slug} → ${stillThere.status()} (200 = orphaned, not cascaded)`);
  });
});
