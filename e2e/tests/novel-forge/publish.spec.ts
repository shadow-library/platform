/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, PERSONAS, pollJob, subFor } from '../../lib';
import { buildFinalBundle, deleteProjectQuietly, jsonOrUndefined, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The fast, AI-free content path: hand-author a valid `final`-mode novel-import bundle, land it in one call,
 * publish metadata + chapters, exercise the forge-side gates (PUB_002/PUB_003) and access management, then
 * attempt to verify the one-way push actually reached web-novel. Serial, because every step builds on the last
 * project's state. NOTE: the reader push is broken in this dev cluster (see the fixmes), so the cross-app
 * arrival checks are recorded as fixmes with server-log evidence rather than asserted.
 */

test.describe.configure({ mode: 'serial' });

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

test.describe('novel-forge import and publish pipeline', () => {
  const slug = `e2e-forge-pub-${uniqueSuffix()}`;
  const novelTitle = `E2E Forge Published ${uniqueSuffix()}`;
  let forgeCtx: APIRequestContext;
  let webGuestCtx: APIRequestContext;
  let webUser2Ctx: APIRequestContext;
  let projectId: string;

  test.beforeAll(async () => {
    forgeCtx = await apiContext('novelForge', 'user1');
    webGuestCtx = await apiContext('webNovel');
    webUser2Ctx = await apiContext('webNovel', 'user2');
  });

  test.afterAll(async () => {
    if (projectId) await deleteProjectQuietly(forgeCtx, projectId);
    await forgeCtx.dispose();
    await webGuestCtx.dispose();
    await webUser2Ctx.dispose();
  });

  test('should import a valid final bundle and land its chapters', async () => {
    const importRes = await mutate(forgeCtx, 'post', '/api/v1/import', { data: { bundle: buildFinalBundle(novelTitle) } });
    expect(importRes.status(), await importRes.text()).toBe(202);
    const { projectId: pid, jobId } = (await importRes.json()) as { projectId: string; jobId: string };
    projectId = pid;
    expect(projectId).toMatch(/^[0-9]+$/);

    const job = await pollJob<{ status: string; lastError?: string }>(forgeCtx, jobId, { timeoutMs: 60_000 });
    expect(job.status, `import job failed: ${job.lastError ?? ''}`).toBe('done');

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
      data: { novelSlug: slug, title: novelTitle, genres: ['fantasy', 'slow-burn'] },
    });
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as { novelSlug: string; title: string };
    expect(body.novelSlug).toBe(slug);
    expect(body.title).toBe(novelTitle);
  });

  test('should enforce contiguous chapter publishing (PUB_003) on the forge ledger', async () => {
    // These are pure forge-side gates on the publication ledger — they hold regardless of whether the
    // downstream reader push succeeds (it does not in this environment; see the fixmes below). Chapter 1 is
    // accepted (202, enqueued)...
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
    // `pending`. The reader-side effect of this grant is covered by the fixme below.
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

  test('should run reconcile and report a coherent (reader-outage) result', async () => {
    // With the reader unreachable, reconcile surfaces the outage as PUB_004 (its controller documents this).
    // In a healthy environment the same call returns 200 with an applied/noop + pushed/failed breakdown. Accept
    // either, but assert the shape of whichever lands so a regression in the response contract still fails.
    const response = await mutate(forgeCtx, 'post', `/api/v1/projects/${projectId}/publications/reconcile`);
    expect([200, 500]).toContain(response.status());
    const body = (await response.json()) as Record<string, unknown> & { code?: string };
    if (response.status() === 200) {
      expect(['applied', 'noop']).toContain(body.novel);
      expect(Array.isArray(body.pushed)).toBe(true);
      expect(Array.isArray(body.failed)).toBe(true);
    } else {
      expect(body.code).toBe('PUB_004');
    }
  });

  test('should reject a garbage bundle with a 422 validation error', async () => {
    // NOTE: novel-import validation surfaces a 422 VALIDATION_ERROR, NOT IMP_002 (that code belongs to the
    // separate plan-import endpoint). Missing envelope literals + no volumes is rejected before any DB write.
    const response = await mutate(forgeCtx, 'post', '/api/v1/import', { data: { bundle: { format: 'not-a-bundle', novel: {} } } });
    expect(response.status()).toBe(422);
    expect((await jsonOrUndefined<{ code: string }>(response))?.code).toBe('VALIDATION_ERROR');
  });

  test('should delete the forge project', async () => {
    const del = await mutate(forgeCtx, 'delete', `/api/v1/projects/${projectId}`);
    expect(del.status()).toBe(204);
    projectId = '';
  });

  // SUSPECTED ENVIRONMENT/INTERCONNECT BUG — the one-way reader push from novel-forge to web-novel is broken in
  // this dev cluster, so nothing published on the forge ever reaches the web-novel reader. The forge mints a
  // valid M2M token (aud api://web-novel, scope web-novel:publish) but the push target resolves to a bare
  // `http://web-novel-server` host that does not connect:
  //   APIRequest: "PUT http://web-novel-server/internal/novels/<slug> - failed" reason
  //     "Unable to connect. Is the computer able to access the url?" / "Was there a typo in the url or port?"
  //   ReaderPushClient: "reader push transport failure" → PublishRunner aborts → job fails PUB_004.
  // (novel-forge-server logs, PublishRunner/ReaderPushClient; chapter ledger status settles to `failed`.)
  // Root cause is a service-endpoint/DNS misconfiguration (missing namespace/port on the discovered web-novel
  // internal base URL), not a test issue — so the two cross-app verifications below cannot pass here. Recorded,
  // not "fixed". They also carry the intended orphan-vs-retire observation for a healthy environment.
  test.fixme('should surface the published novel and its chapters on web-novel', async () => {
    const detail = await pollWebNovel(webGuestCtx, `/api/novels/${slug}`, 200);
    expect(detail.status()).toBe(200);
    const detailBody = (await detail.json()) as { title: string; chapterCount: number };
    expect(detailBody.title).toBe(novelTitle);
    expect(detailBody.chapterCount).toBeGreaterThanOrEqual(2);
    const chapters = await webGuestCtx.get(`/api/novels/${slug}/chapters`);
    expect((await chapters.json()).items.map((c: { ordinal: number }) => c.ordinal)).toEqual(expect.arrayContaining([1, 2]));
  });

  test.fixme('should restrict web-novel reads to the granted user and hide from guests', async () => {
    await mutate(forgeCtx, 'put', `/api/v1/projects/${projectId}/publications/access`, {
      data: { visibility: 'RESTRICTED', grants: [{ email: PERSONAS.user2.email }] },
    });
    expect((await pollWebNovel(webGuestCtx, `/api/novels/${slug}`, 404)).status()).toBe(404);
    expect((await pollWebNovel(webUser2Ctx, `/api/novels/${slug}`, 200)).status()).toBe(200);
  });
});
