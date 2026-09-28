/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse, request } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  clientIpHeaders,
  createIdentitySession,
  evictSessionCache,
  findPlatformOrganisationId,
  identityDb,
  identityStorageState,
  mutate,
  novelForgeDb,
  pollUntil,
  readSeedManifest,
  requireProductUrl,
  runAll,
  webNovelDb,
} from '../../lib';
import { createProject, type ReconcileResult } from '../novel-forge/forge-helpers';
import { deleteNovels, type NovelVisibility } from './helpers';

/**
 * Defining types
 */

export interface ForgePublication {
  /** The author's novel-forge context; every access change goes through its public API. */
  readonly ctx: APIRequestContext;
  readonly projectId: string;
  readonly slug: string;
}

export interface ForgeAccessGrant {
  readonly email: string;
  readonly subjectId?: string | null;
  readonly state: 'resolved' | 'pending';
}

export interface ForgeAccess {
  readonly visibility: NovelVisibility;
  readonly accessRevision: number;
  readonly grants: ForgeAccessGrant[];
}

export interface PublishJob {
  readonly status: 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled';
  readonly lastError: string | null;
  readonly updatedAt: Date;
}

export interface ForgePublicationRow {
  readonly novelSlug: string;
  readonly title: string;
  readonly originalAuthor: string | null;
  readonly blurb: string | null;
  readonly genres: string[] | null;
  readonly tags: string[] | null;
  readonly sexualContent: string | null;
  readonly violence: string | null;
  readonly darkContent: string | null;
  readonly status: string;
  readonly revision: number;
  readonly publishToken: string | null;
}

export interface ForgeChapterLedgerRow {
  readonly chapter: number;
  readonly publishedOrdinal: number;
  readonly title: string;
  readonly authorNote: string | null;
  readonly contentRating: Record<string, string> | null;
  readonly status: 'scheduled' | 'published' | 'failed' | 'unpublished';
  readonly revision: number;
  readonly contentHash: string;
  readonly scheduledAt: Date | null;
  readonly publishedAt: Date | null;
  readonly error: string | null;
  readonly updatedAt: Date;
}

export interface ForgeWikiLedgerRow {
  readonly entryKey: string;
  readonly state: 'pending' | 'pushed' | 'failed' | 'deleted';
  readonly revision: number;
  readonly contentHash: string;
  readonly error: string | null;
  readonly updatedAt: Date;
}

/** Canonical chapter columns no route edits on a locked chapter without a model; only the fields given are written. */
export interface ForgeChapterRevision {
  content?: string;
  contentRating?: Record<string, string>;
  title?: string | null;
  note?: string | null;
  wordCount?: number;
  locked?: boolean;
}

export interface ForgeSession {
  readonly ctx: APIRequestContext;
  close(): Promise<void>;
}

/**
 * Declaring the constants
 *
 * Novel-forge is the only caller web-novel admits to `/internal/novels/*`, and only from inside its pod, so these drive the reader's
 * access surface the one legitimate way: the author's own forge API, whose auto-push converge makes the real in-cluster call.
 */

export const FORGE_CLIENT_ID = 'novel-forge';

const PUBLISH_SETTLE_TIMEOUT_MS = 60_000;

export class ForgePublicationError extends Error {
  override readonly name = 'ForgePublicationError';
}

function isActive(job: PublishJob | undefined): boolean {
  return job?.status === 'pending' || job?.status === 'in_progress';
}

async function expectStatus(response: APIResponse, status: number, action: string): Promise<void> {
  if (response.status() !== status) throw new ForgePublicationError(`${action} answered ${response.status()}: ${await response.text()}`);
}

/**
 * Waits for the project's one `publish` job to leave pending/in-progress. A forge mutation made while that job is active dedups onto it
 * and can miss the pass that job already started, so every access change settles the push it caused before anything else happens.
 */
export async function settlePublishJob(projectId: string): Promise<PublishJob | undefined> {
  const job = await pollUntil(
    () => readPublishJob(projectId),
    current => !isActive(current),
    { timeoutMs: PUBLISH_SETTLE_TIMEOUT_MS, intervalMs: 250 },
  );
  if (isActive(job)) throw new ForgePublicationError(`publish job for project ${projectId} still ${job?.status} after ${PUBLISH_SETTLE_TIMEOUT_MS}ms`);
  return job;
}

/** The project's one `publish` job as it stands, without waiting on it. */
export async function readPublishJob(projectId: string): Promise<PublishJob | undefined> {
  const [row] = await novelForgeDb()<PublishJob[]>`
    SELECT status, last_error AS "lastError", updated_at AS "updatedAt" FROM jobs WHERE project_id = ${projectId} AND kind = 'publish'
  `;
  return row;
}

export async function createForgeProject(ctx: APIRequestContext, slug: string): Promise<string> {
  const { id, response } = await createProject(ctx, { name: slug, kind: 'new_novel', contentMode: 'standard' });
  await expectStatus(response, 201, 'project create');
  return id;
}

/** Publishes the project's metadata under `slug` and waits until the reader serves it. */
export async function publishForgeNovel(ctx: APIRequestContext, projectId: string, slug: string): Promise<void> {
  const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/publish`, { data: { novelSlug: slug, title: `E2E ${slug}` } });
  await expectStatus(response, 200, 'novel publish');
  const job = await settlePublishJob(projectId);
  if (job?.status !== 'done') throw new ForgePublicationError(`the first publish of ${slug} did not converge: ${job?.status} ${job?.lastError ?? ''}`);
}

/** Replaces the publication's share list as the author's access panel does, without waiting on the push it enqueues. */
export async function putForgeAccess(publication: ForgePublication, visibility: NovelVisibility, emails: string[]): Promise<ForgeAccess> {
  const response = await mutate(publication.ctx, 'put', `/api/v1/projects/${publication.projectId}/publications/access`, {
    data: { visibility, grants: emails.map(email => ({ email })) },
  });
  await expectStatus(response, 200, 'access update');
  return (await response.json()) as ForgeAccess;
}

/** {@link putForgeAccess}, then settles the push it enqueued and requires it to end `expected`. */
export async function setForgeAccess(publication: ForgePublication, visibility: NovelVisibility, emails: string[], expected: 'done' | 'failed' = 'done'): Promise<ForgeAccess> {
  const access = await putForgeAccess(publication, visibility, emails);
  const job = await settlePublishJob(publication.projectId);
  if (job?.status !== expected) throw new ForgePublicationError(`the access push for ${publication.slug} ended ${job?.status}, not ${expected}: ${job?.lastError ?? ''}`);
  return access;
}

/**
 * Stands the project's settled `publish` job in for a converge that is still running and has already read the share list. Nothing
 * picks it up: dispatch skips a job that is not pending, and only a boot resets an in-progress one.
 */
export async function holdPublishJob(projectId: string): Promise<void> {
  const held = await novelForgeDb()`UPDATE jobs SET status = 'in_progress', updated_at = now() WHERE project_id = ${projectId} AND kind = 'publish' AND status = 'done'`;
  if (held.count !== 1) throw new ForgePublicationError(`no settled publish job to hold for project ${projectId}`);
}

export async function releasePublishJob(projectId: string): Promise<void> {
  await novelForgeDb()`UPDATE jobs SET status = 'done', updated_at = now() WHERE project_id = ${projectId} AND kind = 'publish' AND status = 'in_progress'`;
}

export function reconcileForge(publication: ForgePublication): Promise<APIResponse> {
  return mutate(publication.ctx, 'post', `/api/v1/projects/${publication.projectId}/publications/reconcile`);
}

/** Removes every reader novel published under the project's ref, wherever a slug conflict moved it, with its audit trail. */
export async function removeServedNovelsOf(projectId: string): Promise<void> {
  const removed = await webNovelDb()<{ slug: string }[]>`DELETE FROM novels WHERE source_client_id = ${FORGE_CLIENT_ID} AND source_ref = ${projectId} RETURNING slug`;
  await deleteNovels(removed.map(row => row.slug));
}

/**
 * Settles any push still in flight first, or it could recreate the reader's row after it is deleted; every step still runs if an earlier
 * one fails. The reader's row is found by the forge's own `sourceRef` as well as the slug, since a converge that met a slug conflict would
 * have moved it.
 */
export async function removeForgePublication(ctx: APIRequestContext, projectId: string, slug: string): Promise<void> {
  const forgeSteps = projectId
    ? [
        () => settlePublishJob(projectId),
        async () => {
          const deleted = await mutate(ctx, 'delete', `/api/v1/projects/${projectId}`);
          if (deleted.status() !== 204 && deleted.status() !== 404) throw new ForgePublicationError(`project ${projectId} delete answered ${deleted.status()}`);
        },
        () => removeServedNovelsOf(projectId),
      ]
    : [];
  await runAll([...forgeSteps, () => deleteNovels([slug])]);
}

/** Saves publication metadata as the author's publish form does, then settles the push it enqueued; the caller judges how that ended. */
export async function publishForge(ctx: APIRequestContext, projectId: string, body: Record<string, unknown>): Promise<PublishJob | undefined> {
  const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/publish`, { data: body });
  await expectStatus(response, 200, 'novel publish');
  return settlePublishJob(projectId);
}

export async function publishForgeChapter(ctx: APIRequestContext, projectId: string, chapter: number): Promise<PublishJob | undefined> {
  const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/chapters/${chapter}/publish`, { data: {} });
  await expectStatus(response, 202, `chapter ${chapter} publish`);
  return settlePublishJob(projectId);
}

export async function unpublishForgeChapter(ctx: APIRequestContext, projectId: string, chapter: number): Promise<PublishJob | undefined> {
  const response = await mutate(ctx, 'delete', `/api/v1/projects/${projectId}/chapters/${chapter}/publish`);
  await expectStatus(response, 202, `chapter ${chapter} unpublish`);
  return settlePublishJob(projectId);
}

export async function reconcileSettled(publication: ForgePublication): Promise<ReconcileResult> {
  const response = await reconcileForge(publication);
  await expectStatus(response, 200, 'reconcile');
  return (await response.json()) as ReconcileResult;
}

export async function readForgePublication(projectId: string): Promise<ForgePublicationRow | undefined> {
  const [row] = await novelForgeDb()<ForgePublicationRow[]>`
    SELECT novel_slug AS "novelSlug", title, original_author AS "originalAuthor", blurb, genres, tags, sexual_content AS "sexualContent", violence,
      dark_content AS "darkContent", status, revision, publish_token AS "publishToken"
    FROM publications WHERE project_id = ${projectId}
  `;
  return row;
}

export async function readForgeLedger(projectId: string): Promise<ForgeChapterLedgerRow[]> {
  return novelForgeDb()<ForgeChapterLedgerRow[]>`
    SELECT chapter, published_ordinal AS "publishedOrdinal", title, author_note AS "authorNote", content_rating AS "contentRating", status, revision,
      content_hash AS "contentHash", scheduled_at AS "scheduledAt", published_at AS "publishedAt", error, updated_at AS "updatedAt"
    FROM chapter_publications WHERE project_id = ${projectId} ORDER BY published_ordinal
  `;
}

export async function readForgeWikiLedger(projectId: string): Promise<ForgeWikiLedgerRow[]> {
  return novelForgeDb()<ForgeWikiLedgerRow[]>`
    SELECT entry_key AS "entryKey", state, revision, content_hash AS "contentHash", error, updated_at AS "updatedAt"
    FROM wiki_publications WHERE project_id = ${projectId} ORDER BY entry_key
  `;
}

/** Puts a published ledger row back to `scheduled`, as a push whose acknowledgement was lost would leave it. */
export async function rescheduleForgeChapter(projectId: string, ordinal: number): Promise<void> {
  const updated = await novelForgeDb()`
    UPDATE chapter_publications SET status = 'scheduled', updated_at = now() WHERE project_id = ${projectId} AND published_ordinal = ${ordinal} AND status = 'published'
  `;
  if (updated.count !== 1) throw new ForgePublicationError(`no published ledger row ${ordinal} to reschedule for project ${projectId}`);
}

/** Puts a pushed wiki ledger row back to `pending`, as a push whose acknowledgement was lost would leave it. */
export async function repeatForgeWikiPush(projectId: string, entryKey: string): Promise<void> {
  const updated = await novelForgeDb()`
    UPDATE wiki_publications SET state = 'pending', updated_at = now() WHERE project_id = ${projectId} AND entry_key = ${entryKey} AND state = 'pushed'
  `;
  if (updated.count !== 1) throw new ForgePublicationError(`no pushed wiki ledger row ${entryKey} to repeat for project ${projectId}`);
}

export async function reviseForgeChapter(projectId: string, chapter: number, revision: ForgeChapterRevision): Promise<void> {
  const sql = novelForgeDb();
  const columns = {
    content: revision.content,
    content_rating: revision.contentRating === undefined ? undefined : sql.json(revision.contentRating),
    title: revision.title,
    note: revision.note,
    word_count: revision.wordCount,
    locked: revision.locked,
  };
  const updated = await sql`
    UPDATE chapters SET ${sql(Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined)))}, updated_at = now()
    WHERE project_id = ${projectId} AND number = ${chapter}
  `;
  if (updated.count !== 1) throw new ForgePublicationError(`no chapter ${chapter} to revise for project ${projectId}`);
}

export async function readForgeChapterContent(projectId: string, chapter: number): Promise<string> {
  const [row] = await novelForgeDb()<{ content: string }[]>`SELECT content FROM chapters WHERE project_id = ${projectId} AND number = ${chapter}`;
  if (!row) throw new ForgePublicationError(`no chapter ${chapter} for project ${projectId}`);
  return row.content;
}

/** The wiki switch has no route: `UpdateEntityBody` omits it, so hiding an entity from readers is arranged in the forge's table. */
export async function setForgeWikiVisibility(projectId: string, entityKey: string, visibility: 'default' | 'hidden'): Promise<void> {
  const updated = await novelForgeDb()`
    UPDATE entities SET wiki_visibility = ${visibility}::entity_wiki_visibility, updated_at = now() WHERE project_id = ${projectId} AND entity_key = ${entityKey}
  `;
  if (updated.count !== 1) throw new ForgePublicationError(`no entity ${entityKey} to set wiki visibility on for project ${projectId}`);
}

/**
 * A novel-forge session for the bootstrap admin, the one persona holding `novel-forge:curate` — granted in the platform organisation, not
 * the admin's personal one, so the session is switched into it. The setup project signs the admin into Pulse only, so this opens the
 * forge session through the same OIDC hop a browser takes, on a central session minted for the purpose.
 */
export async function openCuratorSession(clientIp: string): Promise<ForgeSession> {
  const session = await createIdentitySession(readSeedManifest().users.admin.userId, { aal: 'AAL2' });
  const ctx = await request.newContext({
    baseURL: requireProductUrl('novelForge'),
    ignoreHTTPSErrors: true,
    storageState: identityStorageState(session),
    extraHTTPHeaders: clientIpHeaders(clientIp),
  });
  const close = (): Promise<void> =>
    runAll([() => ctx.dispose(), () => identityDb()`DELETE FROM user_sessions WHERE id = ${session.sessionId}`, () => evictSessionCache(session.secret)]);

  try {
    await ctx.get(`/api/auth/login?${new URLSearchParams({ return_to: '/' })}`);
    const signedIn = await ctx.get('/api/auth/session');
    if (!signedIn.ok()) throw new ForgePublicationError(`no novel-forge session for the curator: ${signedIn.status()} ${await signedIn.text()}`);
    const switched = await mutate(ctx, 'post', '/api/auth/organisation', { data: { organisationId: await findPlatformOrganisationId() } });
    if (!switched.ok()) throw new ForgePublicationError(`the curator could not act in the platform organisation: ${switched.status()} ${await switched.text()}`);
  } catch (error) {
    await close();
    throw error;
  }
  return { ctx, close };
}
