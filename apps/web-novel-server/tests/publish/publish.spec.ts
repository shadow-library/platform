/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { asc, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { schema } from '@server/modules/datastore';

import { TestEnvironment } from '../test-environment';
import { AUDIENCE, forgeToken, idp, userToken } from '../test-idp';

/**
 * Defining types
 */

interface PushOptions {
  body?: object;
  token?: string;
}

/**
 * Declaring the constants
 */
const env = new TestEnvironment('publish').init();
const SLUG = 'moonfall';

const novelBody = (revision: number, overrides: object = {}) => ({
  title: 'Moonfall',
  blurb: 'A city under a falling moon',
  genres: ['fantasy'],
  status: 'live',
  revision,
  ...overrides,
});
const chapterBody = (revision: number, contentHash: string, overrides: object = {}) => ({
  title: 'The Falling Sky',
  content: 'The moon hung lower that night than it ever had before.',
  contentHash,
  revision,
  wordCount: 11,
  ...overrides,
});

/** Builds and dispatches an internal-surface request; the chain resolves to the response */
async function push(method: 'put' | 'delete' | 'get', path: string, options: PushOptions = {}) {
  const bearer = options.token ?? (await forgeToken());
  const mock = env.getRouter().mockRequest();
  const chain = mock[method](path).headers({ authorization: `Bearer ${bearer}` });
  return options.body ? chain.body(options.body) : chain;
}

const auditRows = () => env.getPostgresClient().select().from(schema.publishAuditLog).orderBy(asc(schema.publishAuditLog.id));
const novelRows = () => env.getPostgresClient().select().from(schema.novels).where(eq(schema.novels.slug, SLUG));
const chapterRows = () => env.getPostgresClient().select().from(schema.publishedChapters).orderBy(asc(schema.publishedChapters.ordinal));

const publishNovel = async (revision = 1) => {
  const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(revision) });
  expect(response.statusCode).toBe(200);
};

describe('Internal publish API', () => {
  describe('novel metadata upsert', () => {
    it('should create the novel, store the incoming revision, and record an applied audit row', async () => {
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ slug: SLUG, outcome: 'applied', revision: 1 });

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ slug: SLUG, title: 'Moonfall', genres: ['fantasy'], status: 'live', revision: 1 });

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'novel.upsert',
        novelSlug: SLUG,
        callerSub: 'novel-forge-server',
        callerClientId: 'novel-forge-server',
        incomingRevision: 1,
        storedRevision: null,
        outcome: 'applied',
      });
    });

    it('should answer 204 no-op when the revision and metadata are unchanged', async () => {
      await publishNovel(1);
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1) });
      expect(response.statusCode).toBe(204);

      const rows = await auditRows();
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({ action: 'novel.upsert', outcome: 'noop', incomingRevision: 1, storedRevision: 1 });
    });

    it('should reject a stale revision with 409 and record stale_rejected without mutating the row', async () => {
      await publishNovel(3);
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(2, { title: 'Stale Title' }) });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'WBN_003' });

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ title: 'Moonfall', revision: 3 });

      const rows = await auditRows();
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({ action: 'novel.upsert', outcome: 'stale_rejected', incomingRevision: 2, storedRevision: 3 });
    });

    it('should apply an equal-revision push that carries different metadata', async () => {
      await publishNovel(1);
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { title: 'Moonfall: Definitive Edition', genres: ['fantasy', 'drama'] }) });
      expect(response.statusCode).toBe(200);

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ title: 'Moonfall: Definitive Edition', genres: ['fantasy', 'drama'], revision: 1 });
    });

    it('should apply a higher revision and store it', async () => {
      await publishNovel(1);
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(5, { status: 'retired' }) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ outcome: 'applied', revision: 5 });

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ status: 'retired', revision: 5 });
    });
  });

  describe('chapter upsert', () => {
    it('should create the chapter and record an applied audit row with the content hash', async () => {
      await publishNovel();
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1, 'hash-a') });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ slug: SLUG, outcome: 'applied', revision: 1 });

      const [chapter] = await chapterRows();
      expect(chapter).toMatchObject({ ordinal: 1, title: 'The Falling Sky', contentHash: 'hash-a', revision: 1, wordCount: 11 });

      const rows = await auditRows();
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({
        action: 'chapter.upsert',
        novelSlug: SLUG,
        ordinal: 1,
        contentHash: 'hash-a',
        incomingRevision: 1,
        storedRevision: null,
        outcome: 'applied',
      });
    });

    it('should answer 204 no-op when the revision and content hash both match', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1, 'hash-a') });
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1, 'hash-a') });
      expect(response.statusCode).toBe(204);

      const rows = await auditRows();
      expect(rows).toHaveLength(3);
      expect(rows[2]).toMatchObject({ action: 'chapter.upsert', ordinal: 1, outcome: 'noop', incomingRevision: 1, storedRevision: 1 });
    });

    it('should reject a stale chapter revision with 409 and keep the stored content', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(4, 'hash-d') });
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(3, 'hash-c') });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'WBN_003' });

      const [chapter] = await chapterRows();
      expect(chapter).toMatchObject({ contentHash: 'hash-d', revision: 4 });

      const rows = await auditRows();
      expect(rows[rows.length - 1]).toMatchObject({ action: 'chapter.upsert', outcome: 'stale_rejected', incomingRevision: 3, storedRevision: 4, contentHash: 'hash-c' });
    });

    it('should apply an equal-revision push whose content hash differs', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(2, 'hash-a') });
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(2, 'hash-b', { content: 'Rewritten under the same revision.' }) });
      expect(response.statusCode).toBe(200);

      const [chapter] = await chapterRows();
      expect(chapter).toMatchObject({ contentHash: 'hash-b', revision: 2 });
    });

    it('should answer 404 for an unknown novel and record an error audit row', async () => {
      const response = await push('put', '/internal/novels/unknown-novel/chapters/1', { body: chapterBody(1, 'hash-a') });
      expect(response.statusCode).toBe(404);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'chapter.upsert', novelSlug: 'unknown-novel', ordinal: 1, outcome: 'error', callerSub: 'novel-forge-server' });
      expect(rows[0]?.error).toBeString();
    });
  });

  describe('chapter unpublish', () => {
    it('should delete the chapter, record applied, and stay idempotent with a noop on repeat', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1, 'hash-a') });

      const first = await push('delete', `/internal/novels/${SLUG}/chapters/1`);
      expect(first.statusCode).toBe(204);
      expect(await chapterRows()).toHaveLength(0);

      const second = await push('delete', `/internal/novels/${SLUG}/chapters/1`);
      expect(second.statusCode).toBe(204);

      const rows = await auditRows();
      expect(rows).toHaveLength(4);
      expect(rows[2]).toMatchObject({ action: 'chapter.unpublish', ordinal: 1, outcome: 'applied', storedRevision: 1, contentHash: 'hash-a' });
      expect(rows[3]).toMatchObject({ action: 'chapter.unpublish', ordinal: 1, outcome: 'noop' });
    });

    it('should stay a noop for an unknown novel', async () => {
      const response = await push('delete', '/internal/novels/unknown-novel/chapters/1');
      expect(response.statusCode).toBe(204);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'chapter.unpublish', novelSlug: 'unknown-novel', outcome: 'noop' });
    });
  });

  describe('manifest', () => {
    it('should reflect the served chapters exactly, ordered by ordinal', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1, 'hash-1a') });
      await push('put', `/internal/novels/${SLUG}/chapters/2`, { body: chapterBody(1, 'hash-2a') });
      await push('put', `/internal/novels/${SLUG}/chapters/3`, { body: chapterBody(1, 'hash-3a') });
      await push('delete', `/internal/novels/${SLUG}/chapters/2`);
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(2, 'hash-1b') });

      const response = await push('get', `/internal/novels/${SLUG}/manifest`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        { ordinal: 1, contentHash: 'hash-1b', revision: 2 },
        { ordinal: 3, contentHash: 'hash-3a', revision: 1 },
      ]);
    });

    it('should answer 404 for an unknown novel without writing an audit row', async () => {
      const response = await push('get', '/internal/novels/unknown-novel/manifest');
      expect(response.statusCode).toBe(404);
      expect(await auditRows()).toHaveLength(0);
    });
  });

  describe('authorization', () => {
    it('should reject an end-user token with 403 and audit the attempt as unauthorized', async () => {
      const token = await userToken('reader-1');
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1), token });
      expect(response.statusCode).toBe(403);
      expect(await novelRows()).toHaveLength(0);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'novel.upsert', novelSlug: SLUG, outcome: 'unauthorized', callerSub: 'reader-1' });
    });

    it('should reject a missing token with 401 and audit the attempt without caller info', async () => {
      const response = await env.getRouter().mockRequest().put(`/internal/novels/${SLUG}`).body(novelBody(1));
      expect(response.statusCode).toBe(401);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'novel.upsert', novelSlug: SLUG, outcome: 'unauthorized', callerSub: null, callerClientId: null });
    });

    it('should reject a service token missing the publish scope with 403 and audit it', async () => {
      const token = await forgeToken({ scopes: [] });
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1), token });
      expect(response.statusCode).toBe(403);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ outcome: 'unauthorized', callerClientId: 'novel-forge-server' });
    });

    it('should reject a scoped service token whose client has no service-access rule', async () => {
      const token = await idp.issueToken({ sub: 'rogue-service', kind: 'service', clientId: 'rogue-service', audience: AUDIENCE, scopes: ['webnovel:publish'] });
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1), token });
      expect(response.statusCode).toBe(403);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ outcome: 'unauthorized', callerSub: 'rogue-service', callerClientId: 'rogue-service' });
    });

    it('should reject an end-user token on the manifest read without auditing it', async () => {
      const token = await userToken('reader-1');
      const response = await push('get', `/internal/novels/${SLUG}/manifest`, { token });
      expect(response.statusCode).toBe(403);
      expect(await auditRows()).toHaveLength(0);
    });
  });
});
