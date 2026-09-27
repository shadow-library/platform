/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { getProductUrl, identityDb, webNovelDb } from '../../lib';

/**
 * Defining types
 */

export type AppSessionStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface AppSessionRow {
  readonly userId: string;
  readonly clientId: string;
  readonly status: AppSessionStatus;
  readonly terminatedAt: Date | null;
}

type MutationMethod = 'post' | 'put' | 'patch' | 'delete';

export interface WebNovelMutateOptions {
  data?: unknown;
  headers?: Record<string, string>;
  csrfSeedPath?: string;
}

export type NovelVisibility = 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';

export interface ArrangedNovel {
  readonly id: string;
  readonly slug: string;
}

export interface ArrangedNovelOptions {
  slug: string;
  visibility: NovelVisibility;
  chapters: number;
}

export interface ServedAccess {
  readonly visibility: NovelVisibility;
  readonly accessRevision: number;
  readonly sourceClientId: string;
  /** Sorted, so a comparison never depends on the order the rows were written in. */
  readonly subjectIds: string[];
}

export interface PublishAuditRow {
  readonly id: string;
  readonly action: string;
  readonly outcome: 'applied' | 'noop' | 'stale_rejected' | 'unauthorized' | 'error';
  readonly incomingRevision: number | null;
  readonly storedRevision: number | null;
  readonly callerClientId: string | null;
}

interface ReaderListing {
  items: { slug: string }[];
}

interface ProgressListing {
  items: { novelSlug: string }[];
}

/**
 * Declaring the constants
 */

export const WEB_NOVEL_CLIENT_ID = 'web-novel';

export const WEB_NOVEL_SESSION_COOKIE = '__Host-shadow-session';

export const WEB_NOVEL_LOGIN_STATE_COOKIE = '__Host-shadow-session-login';

/** A well-formed slug no novel is ever published under: the baseline every "indistinguishable from missing" refusal is compared with. */
export const UNKNOWN_SLUG = 'e2e-wn-never-published';

/** The publisher the seed stamps on the novels it owns; not a real client, so no publisher can ever push to these rows. */
const ARRANGED_SOURCE_CLIENT_ID = 'e2e-seed';

export class WebNovelSessionError extends Error {
  override readonly name = 'WebNovelSessionError';
}

/** Follows one hop of the OIDC login chain without following the next, and hands back where it points. */
export async function followRedirect(ctx: APIRequestContext, url: string): Promise<URL> {
  const response = await ctx.get(url, { maxRedirects: 0 });
  const location = response.headers().location;
  if (response.status() !== 302 || !location) throw new WebNovelSessionError(`expected a redirect from ${url}, got ${response.status()} ${await response.text()}`);
  return new URL(location, response.url());
}

/** Identity's `app_sessions` row behind a web-novel handle; identity stores only the handle's SHA-256. */
export async function findAppSession(handle: string): Promise<AppSessionRow | undefined> {
  const sessionHash = createHash('sha256').update(handle).digest('hex');
  const [row] = await identityDb()<AppSessionRow[]>`
    SELECT user_id::text AS "userId", client_id AS "clientId", status, terminated_at AS "terminatedAt" FROM app_sessions WHERE session_hash = ${sessionHash}
  `;
  return row;
}

export async function countActiveAppSessions(userId: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`
    SELECT count(*)::int AS count FROM app_sessions WHERE user_id = ${userId} AND client_id = ${WEB_NOVEL_CLIENT_ID} AND status = 'ACTIVE'
  `;
  return row?.count ?? 0;
}

/** Every web-novel app session identity ever minted for `userId`, whatever its status. */
export async function countAppSessions(userId: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM app_sessions WHERE user_id = ${userId} AND client_id = ${WEB_NOVEL_CLIENT_ID}`;
  return row?.count ?? 0;
}

/**
 * A web-novel-scoped replacement for `lib/api.ts`'s `mutate`. That shared helper's `readCsrfToken` picks the
 * *first* cookie named `csrf-token` in the whole jar (`cookies.find(c => c.name === 'csrf-token')`) with no
 * domain filter — fine for a single-app persona, but every persona this suite seeds a storage state for
 * (`user1`/`user2`) carries a `csrf-token` cookie per app it's signed into (novel-forge *and* web-novel), so the
 * lookup nondeterministically grabs a foreign-origin cookie and the echoed `x-csrf-token` header never matches
 * web-novel's own cookie. The server then rejects the request outright with `403 {"code":"S010", ...}` (a WAF/
 * security-policy block, not a domain error) before it ever reaches app logic — confirmed by direct `curl` with
 * web-novel's own cookie succeeding, and by inspecting `ctx.storageState()` mid-test and finding three same-named
 * `csrf-token` cookies, one per origin. `lib/` is out of this spec directory's ownership, so this file fixes it
 * locally by filtering the cookie jar to the web-novel origin before reading the token half.
 */
export async function webNovelMutate(ctx: APIRequestContext, method: MutationMethod, url: string, options: WebNovelMutateOptions = {}): Promise<APIResponse> {
  await ctx.get(options.csrfSeedPath ?? '/api/auth/session');

  const webNovelOrigin = new URL(getProductUrl('webNovel') ?? 'https://webnovel.shadow-apps.test').hostname;
  const { cookies } = await ctx.storageState();
  const cookie = cookies.find(c => c.name === 'csrf-token' && c.domain.replace(/^\./, '') === webNovelOrigin);
  const token = cookie?.value.split(':')[1];

  const headers = { ...(token ? { 'x-csrf-token': token } : {}), ...options.headers };
  return ctx[method](url, { headers, ...(options.data === undefined ? {} : { data: options.data }) });
}

/** A slug no other test or run can hold, inside the reader's `^[a-z0-9]+(?:-[a-z0-9]+)*$` slug pattern. */
export function uniqueNovelSlug(label: string): string {
  return `e2e-wn-${label}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}

export async function listShelf(ctx: APIRequestContext, path: '/api/library' | '/api/shared'): Promise<string[]> {
  const response = await ctx.get(path);
  if (response.status() !== 200) throw new WebNovelSessionError(`${path} answered ${response.status()} ${await response.text()}`);
  return ((await response.json()) as ReaderListing).items.map(item => item.slug);
}

export async function listProgressSlugs(ctx: APIRequestContext): Promise<string[]> {
  const response = await ctx.get('/api/me/progress');
  if (response.status() !== 200) throw new WebNovelSessionError(`/api/me/progress answered ${response.status()} ${await response.text()}`);
  return ((await response.json()) as ProgressListing).items.map(item => item.novelSlug);
}

/** A novel written straight into the reader's projection, with `chapters` published chapters numbered from 1. */
export async function arrangeNovel(options: ArrangedNovelOptions): Promise<ArrangedNovel> {
  return webNovelDb().begin(async tx => {
    const [novel] = await tx<{ id: string }[]>`
      INSERT INTO novels (slug, source_client_id, source_ref, title, visibility, revision)
      VALUES (${options.slug}, ${ARRANGED_SOURCE_CLIENT_ID}, ${options.slug}, ${`E2E ${options.slug}`}, ${options.visibility}::novel_visibility, 1)
      RETURNING id::text AS id
    `;
    if (!novel) throw new WebNovelSessionError(`novel insert for ${options.slug} returned no row`);
    for (let ordinal = 1; ordinal <= options.chapters; ordinal++) {
      const content = `Chapter ${ordinal} of ${options.slug}.`;
      await tx`
        INSERT INTO published_chapters (novel_id, ordinal, title, content, content_hash, revision, word_count, published_at)
        VALUES (${novel.id}, ${ordinal}, ${`Chapter ${ordinal}`}, ${content}, ${createHash('sha256').update(content).digest('hex')}, 1, ${content.split(' ').length}, now())
      `;
    }
    return { id: novel.id, slug: options.slug };
  });
}

export async function grantNovel(novel: ArrangedNovel, subjectId: string): Promise<void> {
  await webNovelDb()`INSERT INTO novel_grants (novel_id, subject_id) VALUES (${novel.id}, ${subjectId}) ON CONFLICT DO NOTHING`;
}

export async function revokeGrant(novel: ArrangedNovel, subjectId: string): Promise<void> {
  await webNovelDb()`DELETE FROM novel_grants WHERE novel_id = ${novel.id} AND subject_id = ${subjectId}`;
}

export async function shelveNovel(novel: ArrangedNovel, userId: string): Promise<void> {
  await webNovelDb()`INSERT INTO library (user_id, novel_id) VALUES (${userId}, ${novel.id}) ON CONFLICT DO NOTHING`;
}

export async function recordProgress(novel: ArrangedNovel, userId: string, ordinal: number): Promise<void> {
  await webNovelDb()`INSERT INTO reading_progress (user_id, novel_id, ordinal, position, furthest_ordinal) VALUES (${userId}, ${novel.id}, ${ordinal}, 0, ${ordinal})`;
}

/** Removes novels and their publish audit trail; chapters, grants, shelves and progress cascade with the novel. */
export async function deleteNovels(slugs: string[]): Promise<void> {
  if (slugs.length === 0) return;
  const sql = webNovelDb();
  await sql`DELETE FROM novels WHERE slug IN ${sql(slugs)}`;
  await sql`DELETE FROM publish_audit_log WHERE novel_slug IN ${sql(slugs)}`;
}

/** Every shelf and progress row a reader left on any novel, including the seeded ones. */
export async function deleteReaderData(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const sql = webNovelDb();
  await sql`DELETE FROM library WHERE user_id IN ${sql(userIds)}`;
  await sql`DELETE FROM reading_progress WHERE user_id IN ${sql(userIds)}`;
}

export async function readServedAccess(slug: string): Promise<ServedAccess | undefined> {
  const [row] = await webNovelDb()<ServedAccess[]>`
    SELECT n.visibility, n.access_revision AS "accessRevision", n.source_client_id AS "sourceClientId",
      array(SELECT g.subject_id FROM novel_grants g WHERE g.novel_id = n.id) AS "subjectIds"
    FROM novels n WHERE n.slug = ${slug}
  `;
  return row && { ...row, subjectIds: [...row.subjectIds].sort() };
}

export async function setServedAccessRevision(slug: string, accessRevision: number): Promise<void> {
  await webNovelDb()`UPDATE novels SET access_revision = ${accessRevision} WHERE slug = ${slug}`;
}

/**
 * Rewrites a novel's grant rows in the reverse of their physical order, then requires the reader's own unordered read of them to disagree
 * with `pushedOrder`. Whether that read follows the heap or the primary-key index is the planner's choice, so the check is what proves
 * the arrangement took; the set is untouched.
 */
export async function reverseServedGrantOrder(slug: string, pushedOrder: string[]): Promise<void> {
  await webNovelDb().begin(async tx => {
    const [novel] = await tx<{ id: string }[]>`SELECT id::text AS id FROM novels WHERE slug = ${slug}`;
    if (!novel) throw new WebNovelSessionError(`no served novel ${slug}`);
    const grants = await tx<{ subjectId: string }[]>`SELECT subject_id AS "subjectId" FROM novel_grants WHERE novel_id = ${novel.id} ORDER BY ctid`;
    await tx`DELETE FROM novel_grants WHERE novel_id = ${novel.id}`;
    for (const grant of grants.reverse()) await tx`INSERT INTO novel_grants (novel_id, subject_id) VALUES (${novel.id}, ${grant.subjectId})`;
    const held = (await tx<{ subjectId: string }[]>`SELECT subject_id AS "subjectId" FROM novel_grants WHERE novel_id = ${novel.id}`).map(grant => grant.subjectId);
    if (held.length < 2 || held.join() === pushedOrder.join()) throw new WebNovelSessionError(`the held grant order ${held.join()} still matches the pushed ${pushedOrder.join()}`);
  });
}

/** The newest audit row id for `slug`, as a watermark for {@link accessAuditSince}. */
export async function auditWatermark(slug: string): Promise<string> {
  const [row] = await webNovelDb()<{ id: string }[]>`SELECT coalesce(max(id), 0)::text AS id FROM publish_audit_log WHERE novel_slug = ${slug}`;
  return row?.id ?? '0';
}

export async function accessAuditSince(slug: string, watermark: string): Promise<PublishAuditRow[]> {
  return webNovelDb()<PublishAuditRow[]>`
    SELECT id::text AS id, action, outcome, incoming_revision AS "incomingRevision", stored_revision AS "storedRevision", caller_client_id AS "callerClientId"
    FROM publish_audit_log WHERE novel_slug = ${slug} AND action = 'novel.access' AND id > ${watermark}::bigint ORDER BY id
  `;
}
