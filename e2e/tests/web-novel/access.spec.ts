/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, pollUntil, runAll } from '../../lib';
import { test as base, expect, type WebNovelReader } from './fixtures';
import {
  createForgeProject,
  FORGE_CLIENT_ID,
  type ForgeAccess,
  type ForgePublication,
  ForgePublicationError,
  holdPublishJob,
  publishForgeNovel,
  putForgeAccess,
  reconcileForge,
  releasePublishJob,
  removeForgePublication,
  setForgeAccess,
} from './forge-publication';
import { accessAuditSince, auditWatermark, readServedAccess, reverseServedGrantOrder, setServedAccessRevision, uniqueNovelSlug, UNKNOWN_SLUG } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * web-novel's `PUT /internal/novels/:slug/access`, reached the only way it can be: user1 authors a novel-forge publication and changes its
 * share list, and forge's converge makes the real call. Outcomes are read from web-novel's own tables — the served grants and one
 * `publish_audit_log` row per access push. Forge never sends an organisation it did not take from the session, a push without a
 * visibility, or an access push for a novel it has not created, so WBN_007, WBN_008, the 422 and the unknown-novel 404 are out of reach.
 */

const test = base.extend<{ publication: ForgePublication }>({
  // Playwright reads fixture dependencies from the destructuring pattern, so a dependency-free fixture must still declare one.
  // eslint-disable-next-line no-empty-pattern
  publication: async ({}, use) => {
    const ctx = await apiContext('novelForge', 'user1');
    const slug = uniqueNovelSlug('access');
    let projectId = '';
    try {
      projectId = await createForgeProject(ctx, slug);
      await publishForgeNovel(ctx, projectId, slug);
      await use({ ctx, projectId, slug });
    } finally {
      await runAll([() => removeForgePublication(ctx, projectId, slug), () => ctx.dispose()]);
    }
  },
});

function expectResolved(access: ForgeAccess, readers: WebNovelReader[]): void {
  const grants = access.grants.map(grant => ({ email: grant.email, subjectId: grant.subjectId, state: grant.state }));
  const wanted = readers.map(reader => ({ email: reader.user.email.toLowerCase(), subjectId: reader.user.userId, state: 'resolved' }));
  expect(grants).toEqual(expect.arrayContaining(wanted));
  expect(grants).toHaveLength(wanted.length);
}

function subjects(...readers: WebNovelReader[]): string[] {
  return readers.map(reader => reader.user.userId).sort();
}

/** Forge pushes resolved grants in the order it loads them, by email (`publication-access.service.ts:111`). */
function pushedOrder(...readers: WebNovelReader[]): string[] {
  return [...readers].sort((a, b) => a.user.email.toLowerCase().localeCompare(b.user.email.toLowerCase())).map(reader => reader.user.userId);
}

async function detailStatus(ctx: APIRequestContext, slug: string): Promise<number> {
  return (await ctx.get(`/api/novels/${slug}`)).status();
}

async function currentAccessRevision(slug: string): Promise<number> {
  const served = await readServedAccess(slug);
  if (!served) throw new ForgePublicationError(`web-novel does not serve ${slug}`);
  return served.accessRevision;
}

test.describe('web-novel access push (forge-fronted)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('should replace the served grant set when the author changes the share list and record the push as applied', async ({ publication, webNovel }) => {
    const { slug } = publication;
    const first = await webNovel.reader('share-first');
    const second = await webNovel.reader('share-second');
    const initial = await currentAccessRevision(slug);

    const opening = await auditWatermark(slug);
    const shared = await setForgeAccess(publication, 'RESTRICTED', [first.user.email, second.user.email]);
    expect(shared.accessRevision).toBe(initial + 1);
    expectResolved(shared, [first, second]);
    expect(await readServedAccess(slug)).toEqual({ visibility: 'RESTRICTED', accessRevision: initial + 1, sourceClientId: FORGE_CLIENT_ID, subjectIds: subjects(first, second) });
    expect(await accessAuditSince(slug, opening)).toEqual([
      expect.objectContaining({ outcome: 'applied', incomingRevision: initial + 1, storedRevision: initial, callerClientId: FORGE_CLIENT_ID }),
    ]);

    const guest = await webNovel.guest();
    const { ctx: firstCtx } = await webNovel.signIn(first);
    const { ctx: secondCtx } = await webNovel.signIn(second);
    expect(await detailStatus(firstCtx, slug)).toBe(200);
    expect(await detailStatus(secondCtx, slug)).toBe(200);
    expect(await detailStatus(guest, slug)).toBe(404);

    const narrowing = await auditWatermark(slug);
    const narrowed = await setForgeAccess(publication, 'RESTRICTED', [first.user.email]);
    expect(narrowed.accessRevision).toBe(initial + 2);
    expect((await readServedAccess(slug))?.subjectIds, 'a push replaces the grant set, it never merges into it').toEqual(subjects(first));
    expect(await accessAuditSince(slug, narrowing)).toEqual([expect.objectContaining({ outcome: 'applied', incomingRevision: initial + 2, storedRevision: initial + 1 })]);

    const [dropped, unknown] = await Promise.all([secondCtx.get(`/api/novels/${slug}`), secondCtx.get(`/api/novels/${UNKNOWN_SLUG}`)]);
    expect(dropped.status()).toBe(404);
    expect(await dropped.text()).toBe(await unknown.text());
    expect(await detailStatus(firstCtx, slug)).toBe(200);
  });

  test('should answer a no-op for an unchanged or reordered share list and leave the served grants as they were', async ({ publication, webNovel }) => {
    const { slug } = publication;
    // Created in this order, the later reader sorts first by email but second by subject, so neither a heap nor an index read of the
    // reversed rows can come back in the order forge pushes them.
    const second = await webNovel.reader('noop-b');
    const first = await webNovel.reader('noop-a');
    const { accessRevision } = await setForgeAccess(publication, 'RESTRICTED', [first.user.email, second.user.email]);
    const served = { visibility: 'RESTRICTED', accessRevision, sourceClientId: FORGE_CLIENT_ID, subjectIds: subjects(first, second) };

    const resaving = await auditWatermark(slug);
    const resaved = await setForgeAccess(publication, 'RESTRICTED', [first.user.email, second.user.email]);
    expect(resaved.accessRevision, 'an unedited share list is not a new access revision').toBe(accessRevision);
    expect(await readServedAccess(slug)).toEqual(served);
    expect(await accessAuditSince(slug, resaving)).toEqual([expect.objectContaining({ outcome: 'noop', incomingRevision: accessRevision, storedRevision: accessRevision })]);

    await reverseServedGrantOrder(slug, pushedOrder(first, second));
    const reordering = await auditWatermark(slug);
    const reordered = await setForgeAccess(publication, 'RESTRICTED', [second.user.email, first.user.email]);
    expect(reordered.accessRevision, 'a share list is a set').toBe(accessRevision);
    expectResolved(reordered, [first, second]);
    expect(await readServedAccess(slug)).toEqual(served);
    expect(await accessAuditSince(slug, reordering), 'the reader must compare the grant set, not the order it holds the rows in').toEqual([
      expect.objectContaining({ outcome: 'noop', incomingRevision: accessRevision, storedRevision: accessRevision }),
    ]);

    const changing = await auditWatermark(slug);
    await setForgeAccess(publication, 'RESTRICTED', [second.user.email]);
    expect(await readServedAccess(slug)).toEqual({ ...served, accessRevision: accessRevision + 1, subjectIds: subjects(second) });
    expect(await accessAuditSince(slug, changing)).toEqual([expect.objectContaining({ outcome: 'applied', incomingRevision: accessRevision + 1 })]);
  });

  test('should refuse an access push behind the served revision with WBN_003 and leave the served grants untouched', async ({ publication, webNovel }) => {
    const { slug } = publication;
    const kept = await webNovel.reader('stale-kept');
    const pending = await webNovel.reader('stale-pending');
    const { accessRevision } = await setForgeAccess(publication, 'RESTRICTED', [kept.user.email]);
    const newer = accessRevision + 10;
    await setServedAccessRevision(slug, newer);
    const { ctx: pendingCtx } = await webNovel.signIn(pending);

    const pushing = await auditWatermark(slug);
    const widened = await setForgeAccess(publication, 'RESTRICTED', [kept.user.email, pending.user.email], 'failed');
    expect(widened.accessRevision).toBe(accessRevision + 1);
    const untouched = { visibility: 'RESTRICTED', accessRevision: newer, sourceClientId: FORGE_CLIENT_ID, subjectIds: subjects(kept) };
    expect(await readServedAccess(slug)).toEqual(untouched);
    const staleRow = expect.objectContaining({ outcome: 'stale_rejected', incomingRevision: accessRevision + 1, storedRevision: newer, callerClientId: FORGE_CLIENT_ID });
    expect(await accessAuditSince(slug, pushing)).toEqual([staleRow]);
    expect(await detailStatus(pendingCtx, slug)).toBe(404);

    const refused = await reconcileForge(publication);
    expect(refused.ok(), 'the author is told the reader refused the push').toBe(false);
    expect(await readServedAccess(slug)).toEqual(untouched);
    expect(await accessAuditSince(slug, pushing)).toEqual([staleRow, staleRow]);
    expect(await detailStatus(pendingCtx, slug)).toBe(404);

    await setServedAccessRevision(slug, accessRevision);
    const reconciled = await reconcileForge(publication);
    expect(reconciled.status(), await reconciled.text()).toBe(200);
    expect(((await reconciled.json()) as { access: string }).access).toBe('applied');
    expect(await readServedAccess(slug)).toEqual({ ...untouched, accessRevision: accessRevision + 1, subjectIds: subjects(kept, pending) });
    expect(await detailStatus(pendingCtx, slug)).toBe(200);
  });

  test('should answer a reconcile the reader refuses as stale with a 409 conflict', async ({ publication, webNovel }) => {
    const reader = await webNovel.reader('stale-status');
    const { accessRevision } = await setForgeAccess(publication, 'RESTRICTED', [reader.user.email]);
    await setServedAccessRevision(publication.slug, accessRevision + 10);

    const refused = await reconcileForge(publication);
    expect(refused.status(), await refused.text()).toBe(409);
    expect(((await refused.json()) as { code?: string }).code).toBe('PUB_011');
  });

  test('should push a share-list narrowing made while a publish converge is running', async ({ publication, webNovel }) => {
    const { slug, projectId } = publication;
    const kept = await webNovel.reader('race-kept');
    const dropped = await webNovel.reader('race-dropped');
    await setForgeAccess(publication, 'RESTRICTED', [kept.user.email, dropped.user.email]);
    const { ctx: droppedCtx } = await webNovel.signIn(dropped);
    expect(await detailStatus(droppedCtx, slug)).toBe(200);

    await holdPublishJob(projectId);
    try {
      const narrowed = await putForgeAccess(publication, 'RESTRICTED', [kept.user.email]);
      expectResolved(narrowed, [kept]);
    } finally {
      await releasePublishJob(projectId);
    }

    const status = await pollUntil(
      () => detailStatus(droppedCtx, slug),
      current => current === 404,
      { timeoutMs: 75_000, intervalMs: 5_000 },
    );
    expect(status, 'the revocation must reach the reader, at the latest by the next publication sweep').toBe(404);
  });
});
