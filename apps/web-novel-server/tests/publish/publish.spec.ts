import { describe, expect, it } from 'bun:test';

import { SQL } from 'bun';
import { asc, eq } from 'drizzle-orm';

import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { schema } from '@server/modules/datastore';

import { TestEnvironment } from '../test-environment';
import { AUDIENCE, FORGE_CLIENT_ID, forgeToken, idp, INGEST_CLIENT_ID, ingestToken, userToken } from '../test-idp';

interface PushOptions {
  body?: object;
  token?: string;
}

const env = new TestEnvironment('publish').init();
const SLUG = 'moonfall';

const novelBody = (revision: number, overrides: object = {}) => ({
  title: 'Moonfall',
  blurb: 'A city under a falling moon',
  genres: ['Fantasy'],
  status: 'live',
  visibility: 'PUBLIC',
  revision,
  ...overrides,
});
const CHAPTER_TITLE = 'The Falling Sky';
const CHAPTER_CONTENT = 'The moon hung lower that night than it ever had before.';
const CHAPTER_HASH = chapterContentHash({ title: CHAPTER_TITLE, content: CHAPTER_CONTENT });

interface ChapterBodyOverrides {
  title?: string;
  content?: string;
  authorNote?: string;
  contentHash?: string;
  wordCount?: number;
}

const chapterBody = (revision: number, overrides: ChapterBodyOverrides = {}) => {
  const title = overrides.title ?? CHAPTER_TITLE;
  const content = overrides.content ?? CHAPTER_CONTENT;
  const contentHash = overrides.contentHash ?? chapterContentHash({ title, content, authorNote: overrides.authorNote });
  return { title, content, revision, wordCount: 11, ...overrides, contentHash };
};

async function push(method: 'put' | 'delete' | 'get', path: string, options: PushOptions = {}) {
  const bearer = options.token ?? (await forgeToken());
  const mock = env.getRouter().mockRequest();
  const chain = mock[method](path).headers({ authorization: `Bearer ${bearer}` });
  return options.body ? chain.body(options.body) : chain;
}

const auditRows = () => env.getPostgresClient().select().from(schema.publishAuditLog).orderBy(asc(schema.publishAuditLog.id));
const novelRows = () => env.getPostgresClient().select().from(schema.novels).where(eq(schema.novels.slug, SLUG));
const chapterRows = () => env.getPostgresClient().select().from(schema.publishedChapters).orderBy(asc(schema.publishedChapters.ordinal));

async function waitUntilBlocked(probe: SQL): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt++) {
    const [row] = await probe`select count(*)::int as blocked from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`;
    if (row.blocked > 0) return;
    await Bun.sleep(10);
  }
  throw new Error('the publish insert never blocked on the slug unique index');
}

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
      expect(novel).toMatchObject({ slug: SLUG, title: 'Moonfall', genres: ['Fantasy'], status: 'live', revision: 1 });

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'novel.upsert',
        novelSlug: SLUG,
        callerSub: 'novel-forge',
        callerClientId: 'novel-forge',
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
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { title: 'Moonfall: Definitive Edition', genres: ['Fantasy', 'Drama'] }) });
      expect(response.statusCode).toBe(200);

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ title: 'Moonfall: Definitive Edition', genres: ['Fantasy', 'Drama'], revision: 1 });
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

  describe('novel vocabulary and content ratings', () => {
    it('should persist the pushed genres, tags and rating dimensions', async () => {
      const body = novelBody(1, {
        genres: ['Fantasy', 'Adventure'],
        tags: ['Cultivation', 'Weak to Strong'],
        sexualContent: 'suggestive',
        violence: 'graphic',
        darkContent: 'mild',
      });
      const response = await push('put', `/internal/novels/${SLUG}`, { body });
      expect(response.statusCode).toBe(200);

      const [novel] = await novelRows();
      expect(novel).toMatchObject({
        genres: ['Fantasy', 'Adventure'],
        tags: ['Cultivation', 'Weak to Strong'],
        sexualContent: 'suggestive',
        violence: 'graphic',
        darkContent: 'mild',
      });
    });

    it('should reject a genre outside the vocabulary without touching the row', async () => {
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { genres: ['Fantasy', 'Grimdark'] }) });
      expect(response.statusCode).toBe(422);
      expect(await novelRows()).toHaveLength(0);
    });

    it('should reject a tag outside the vocabulary without touching the row', async () => {
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { tags: ['Cultivation', 'Sentient Toaster'] }) });
      expect(response.statusCode).toBe(422);
      expect(await novelRows()).toHaveLength(0);
    });

    it('should reject a duplicated genre without touching the row', async () => {
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { genres: ['Fantasy', 'Fantasy'] }) });
      expect(response.statusCode).toBe(422);
      expect(await novelRows()).toHaveLength(0);
    });

    it('should reject a rating level outside its own dimension', async () => {
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { darkContent: 'extreme' }) });
      expect(response.statusCode).toBe(422);
      expect(await novelRows()).toHaveLength(0);
    });

    it('should leave an omitted rating dimension null rather than reading it back as none', async () => {
      await publishNovel(1);

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ sexualContent: null, violence: null, darkContent: null, tags: [] });
    });

    it('should clear a stored rating when a later push omits the dimension', async () => {
      await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { violence: 'extreme' }) });
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(2) });
      expect(response.statusCode).toBe(200);

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ violence: null });
    });

    it('should apply an equal-revision push whose only change is its tags', async () => {
      await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { tags: ['Cultivation'] }) });
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { tags: ['Cultivation', 'Alchemy'] }) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ outcome: 'applied', revision: 1 });

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ tags: ['Cultivation', 'Alchemy'] });
    });

    it('should apply an equal-revision push whose only change is a rating dimension', async () => {
      await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { sexualContent: 'none' }) });
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { sexualContent: 'explicit' }) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ outcome: 'applied', revision: 1 });

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ sexualContent: 'explicit' });
    });

    it('should apply an equal-revision push that drops a rating a stored row asserts', async () => {
      await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1, { sexualContent: 'none' }) });
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ outcome: 'applied', revision: 1 });

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ sexualContent: null });
    });

    it('should answer 204 no-op when the tags and ratings are unchanged too', async () => {
      const body = novelBody(1, { tags: ['Cultivation'], sexualContent: 'moderate' });
      await push('put', `/internal/novels/${SLUG}`, { body });
      const response = await push('put', `/internal/novels/${SLUG}`, { body });
      expect(response.statusCode).toBe(204);
    });
  });

  describe('chapter upsert', () => {
    it('should create the chapter and record an applied audit row with the content hash', async () => {
      await publishNovel();
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ slug: SLUG, outcome: 'applied', revision: 1 });

      const [chapter] = await chapterRows();
      expect(chapter).toMatchObject({ ordinal: 1, title: 'The Falling Sky', contentHash: CHAPTER_HASH, revision: 1, wordCount: 11 });

      const rows = await auditRows();
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({
        action: 'chapter.upsert',
        novelSlug: SLUG,
        ordinal: 1,
        contentHash: CHAPTER_HASH,
        incomingRevision: 1,
        storedRevision: null,
        outcome: 'applied',
      });
    });

    it('should answer 204 no-op when the revision and content hash both match', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1) });
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1) });
      expect(response.statusCode).toBe(204);

      const rows = await auditRows();
      expect(rows).toHaveLength(3);
      expect(rows[2]).toMatchObject({ action: 'chapter.upsert', ordinal: 1, outcome: 'noop', incomingRevision: 1, storedRevision: 1 });
    });

    it('should reject a stale chapter revision with 409 and keep the stored content', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(4) });
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(3) });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'WBN_003' });

      const [chapter] = await chapterRows();
      expect(chapter).toMatchObject({ contentHash: CHAPTER_HASH, revision: 4 });

      const rows = await auditRows();
      expect(rows[rows.length - 1]).toMatchObject({ action: 'chapter.upsert', outcome: 'stale_rejected', incomingRevision: 3, storedRevision: 4, contentHash: CHAPTER_HASH });
    });

    it('should apply an equal-revision push whose content hash differs', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(2) });
      const rewritten = chapterBody(2, { content: 'Rewritten under the same revision.' });
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: rewritten });
      expect(response.statusCode).toBe(200);

      const [chapter] = await chapterRows();
      expect(chapter).toMatchObject({ contentHash: rewritten.contentHash, revision: 2 });
    });

    it('should answer 404 for an unknown novel and record an error audit row', async () => {
      const response = await push('put', '/internal/novels/unknown-novel/chapters/1', { body: chapterBody(1) });
      expect(response.statusCode).toBe(404);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'chapter.upsert', novelSlug: 'unknown-novel', ordinal: 1, outcome: 'error', callerSub: 'novel-forge' });
      expect(rows[0]?.error).toBeString();
    });

    it('should accept a push whose contentHash matches the recomputed hash', async () => {
      await publishNovel();
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1) });
      expect(response.statusCode).toBe(200);
    });

    it('should reject a push whose contentHash does not match the payload with WBN_011 and write nothing', async () => {
      await publishNovel();
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1, { contentHash: 'not-the-real-hash' }) });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'WBN_011' });
      expect(await chapterRows()).toHaveLength(0);
    });

    it('should reject a mismatched contentHash on an update and leave the stored row untouched', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1) });
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, {
        body: chapterBody(2, { content: 'A rewrite the hash was never updated for.', contentHash: 'stale-literal-hash' }),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'WBN_011' });

      const rows = await chapterRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ contentHash: CHAPTER_HASH, revision: 1 });
    });

    it('should verify a push with no authorNote and a push with one, both matching their recomputed hash', async () => {
      await publishNovel();
      const bare = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1) });
      expect(bare.statusCode).toBe(200);

      const noted = chapterBody(2, { authorNote: 'Thanks for reading this arc.' });
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: noted });
      expect(response.statusCode).toBe(200);

      const [chapter] = await chapterRows();
      expect(chapter).toMatchObject({ authorNote: 'Thanks for reading this arc.', contentHash: noted.contentHash });
    });

    it('should treat an absent and a null authorNote as identical inputs to the shared hash contract', () => {
      const withUndefined = chapterContentHash({ title: CHAPTER_TITLE, content: CHAPTER_CONTENT, authorNote: undefined });
      const withNull = chapterContentHash({ title: CHAPTER_TITLE, content: CHAPTER_CONTENT, authorNote: null });
      expect(withUndefined).toBe(withNull);
      expect(withUndefined).toBe(CHAPTER_HASH);
    });

    it('should accept a hash produced directly by chapterContentHash, pinning the shared wire contract', async () => {
      await publishNovel();
      const title = 'A Different Chapter Title';
      const content = 'Entirely different prose for this push.';
      const authorNote = 'From the shared-contract round trip.';
      const hash = chapterContentHash({ title, content, authorNote });
      const response = await push('put', `/internal/novels/${SLUG}/chapters/1`, {
        body: { title, content, authorNote, contentHash: hash, revision: 1, wordCount: 6 },
      });
      expect(response.statusCode).toBe(200);

      const [chapter] = await chapterRows();
      expect(chapter).toMatchObject({ title, content, authorNote, contentHash: hash });
    });
  });

  describe('chapter unpublish', () => {
    it('should delete the chapter, record applied, and stay idempotent with a noop on repeat', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1) });

      const first = await push('delete', `/internal/novels/${SLUG}/chapters/1`);
      expect(first.statusCode).toBe(204);
      expect(await chapterRows()).toHaveLength(0);

      const second = await push('delete', `/internal/novels/${SLUG}/chapters/1`);
      expect(second.statusCode).toBe(204);

      const rows = await auditRows();
      expect(rows).toHaveLength(4);
      expect(rows[2]).toMatchObject({ action: 'chapter.unpublish', ordinal: 1, outcome: 'applied', storedRevision: 1, contentHash: CHAPTER_HASH });
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
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1) });
      await push('put', `/internal/novels/${SLUG}/chapters/2`, { body: chapterBody(1) });
      await push('put', `/internal/novels/${SLUG}/chapters/3`, { body: chapterBody(1) });
      await push('delete', `/internal/novels/${SLUG}/chapters/2`);
      const revised = chapterBody(2, { content: 'Chapter one, revised.' });
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: revised });

      const response = await push('get', `/internal/novels/${SLUG}/manifest`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        { ordinal: 1, contentHash: revised.contentHash, revision: 2 },
        { ordinal: 3, contentHash: CHAPTER_HASH, revision: 1 },
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
      expect(rows[0]).toMatchObject({ outcome: 'unauthorized', callerClientId: 'novel-forge' });
    });

    it('should reject a scoped service token whose client has no service-access rule', async () => {
      const token = await idp.issueToken({ sub: 'rogue-service', kind: 'service', clientId: 'rogue-service', audience: AUDIENCE, scopes: ['web-novel:publish'] });
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

    it('should reject a user-kind token that carries the publish scope with 403 and audit it as unauthorized', async () => {
      const token = await userToken('reader-1', { scopes: ['web-novel:publish'] });
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1), token });
      expect(response.statusCode).toBe(403);
      expect(await novelRows()).toHaveLength(0);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'novel.upsert', novelSlug: SLUG, outcome: 'unauthorized', callerSub: 'reader-1' });
    });

    it('should still record an audit row when a rejected attempt carries an over-long token sub', async () => {
      const longSub = 'z'.repeat(200);
      const token = await idp.issueToken({ sub: longSub, kind: 'user', audience: AUDIENCE, scopes: [] });
      const response = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(1), token });
      expect(response.statusCode).toBe(403);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'novel.upsert', novelSlug: SLUG, outcome: 'unauthorized' });
      expect(rows[0]?.callerSub).toBe(longSub.slice(0, 128));
      expect(rows[0]?.callerSub).toHaveLength(128);
    });
  });
  describe('publisher ownership', () => {
    const wikiBody = (revision: number, contentHash: string) => ({
      type: 'character',
      name: 'Selene',
      firstVisibleOrdinal: 0,
      contentHash,
      revision,
      facets: [],
      images: [],
    });

    const foreign = async (method: 'put' | 'delete' | 'get', path: string, body?: object) => push(method, path, { body, token: await ingestToken() });

    it('should stamp the creating client on the novel it publishes', async () => {
      await publishNovel(1);
      const [novel] = await novelRows();
      expect(novel).toMatchObject({ sourceClientId: 'novel-forge' });
    });

    it('should let a second publisher own a slug of its own', async () => {
      const response = await foreign('put', '/internal/novels/ingested-tale', novelBody(1));
      expect(response.statusCode).toBe(200);

      const [novel] = await env.getPostgresClient().select().from(schema.novels).where(eq(schema.novels.slug, 'ingested-tale'));
      expect(novel).toMatchObject({ sourceClientId: INGEST_CLIENT_ID });
    });

    it('should reject a metadata push from another source with WBN_010 and leave the row untouched', async () => {
      await publishNovel(1);
      const response = await foreign('put', `/internal/novels/${SLUG}`, novelBody(9, { title: 'Hijacked' }));
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'WBN_010' });

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ title: 'Moonfall', revision: 1, sourceClientId: 'novel-forge' });
    });

    it('should answer WBN_010 rather than WBN_003 when a foreign push is also stale', async () => {
      await publishNovel(5);
      const foreignPush = await foreign('put', `/internal/novels/${SLUG}`, novelBody(2, { title: 'Hijacked' }));
      expect(foreignPush.json()).toMatchObject({ code: 'WBN_010' });

      const ownStale = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(2, { title: 'Stale Title' }) });
      expect(ownStale.json()).toMatchObject({ code: 'WBN_003' });
    });

    it('should reject a chapter push from another source with WBN_010', async () => {
      await publishNovel(1);
      const response = await foreign('put', `/internal/novels/${SLUG}/chapters/1`, chapterBody(1));
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'WBN_010' });
      expect(await chapterRows()).toHaveLength(0);
    });

    it('should answer WBN_010 rather than WBN_011 for a foreign-owned slug even when the contentHash is also wrong', async () => {
      await publishNovel(1);
      const response = await foreign('put', `/internal/novels/${SLUG}/chapters/1`, chapterBody(1, { contentHash: 'garbage-hash' }));
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'WBN_010' });
      expect(await chapterRows()).toHaveLength(0);
    });

    it('should reject a chapter unpublish from another source with WBN_010 and keep the chapter', async () => {
      await publishNovel(1);
      await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1) });

      const response = await foreign('delete', `/internal/novels/${SLUG}/chapters/1`);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'WBN_010' });
      expect(await chapterRows()).toHaveLength(1);
    });

    it('should reject an access push from another source with WBN_010', async () => {
      await publishNovel(1);
      const response = await foreign('put', `/internal/novels/${SLUG}/access`, { visibility: 'RESTRICTED', subjectIds: ['900001'], revision: 2 });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'WBN_010' });

      const [novel] = await novelRows();
      expect(novel).toMatchObject({ visibility: 'PUBLIC', accessRevision: 1 });
    });

    it('should reject a wiki push and a wiki delete from another source with WBN_010', async () => {
      await publishNovel(1);
      const upsert = await foreign('put', `/internal/novels/${SLUG}/wiki/selene`, wikiBody(1, 'wiki-a'));
      expect(upsert.statusCode).toBe(409);
      expect(upsert.json()).toMatchObject({ code: 'WBN_010' });

      await push('put', `/internal/novels/${SLUG}/wiki/selene`, { body: wikiBody(1, 'wiki-a') });
      const remove = await foreign('delete', `/internal/novels/${SLUG}/wiki/selene`);
      expect(remove.statusCode).toBe(409);
      expect(remove.json()).toMatchObject({ code: 'WBN_010' });
      expect(await env.getPostgresClient().select().from(schema.wikiEntries)).toHaveLength(1);
    });

    it('should audit a rejected foreign push as unauthorized', async () => {
      await publishNovel(1);
      await foreign('put', `/internal/novels/${SLUG}`, novelBody(9, { title: 'Hijacked' }));

      const rows = await auditRows();
      expect(rows[rows.length - 1]).toMatchObject({ action: 'novel.upsert', novelSlug: SLUG, outcome: 'unauthorized', callerClientId: INGEST_CLIENT_ID });
    });

    it('should read a foreign novel as WBN_001 on the manifest and access reads, never WBN_010', async () => {
      await publishNovel(1);
      const manifest = await foreign('get', `/internal/novels/${SLUG}/manifest`);
      expect(manifest.statusCode).toBe(404);
      expect(manifest.json()).toMatchObject({ code: 'WBN_001' });

      const access = await foreign('get', `/internal/novels/${SLUG}/access`);
      expect(access.statusCode).toBe(404);
      expect(access.json()).toMatchObject({ code: 'WBN_001' });

      const wiki = await foreign('get', `/internal/novels/${SLUG}/wiki/manifest`);
      expect(wiki.statusCode).toBe(404);
      expect(wiki.json()).toMatchObject({ code: 'WBN_001' });
    });

    it('should answer a foreign novel exactly as it answers an unknown one on the manifest read', async () => {
      await publishNovel(1);
      const foreignRead = await foreign('get', `/internal/novels/${SLUG}/manifest`);
      const unknownRead = await foreign('get', '/internal/novels/never-published/manifest');
      expect(foreignRead.statusCode).toBe(unknownRead.statusCode);
      expect(foreignRead.json()).toEqual(unknownRead.json());
    });

    it('should stay a 204 no-op for a foreign caller on an unknown slug rather than leaking WBN_010', async () => {
      const chapter = await foreign('delete', '/internal/novels/never-published/chapters/1');
      expect(chapter.statusCode).toBe(204);

      const wiki = await foreign('delete', '/internal/novels/never-published/wiki/selene');
      expect(wiki.statusCode).toBe(204);
    });

    /**
     * An uncommitted row on another connection is invisible to the request's `SELECT … FOR UPDATE` yet already
     * holds the index entry, so the request reaches its insert and blocks there — no timing assumption. Which
     * publisher committed that row is the whole question, so both owners are driven through the same harness.
     */
    async function raceTheSlugIndex(holderClientId: string, body: object): Promise<ReturnType<typeof push>> {
      const holder = new SQL(env.getDatabaseUrl(), { max: 1 });
      const probe = new SQL(env.getDatabaseUrl(), { max: 1 });
      let commit!: () => void;
      let held!: () => void;
      const committed = new Promise<void>(resolve => (commit = resolve));
      const holdsSlug = new Promise<void>(resolve => (held = resolve));

      try {
        const holding = holder.begin(async tx => {
          await tx`insert into novels (slug, source_client_id, title, revision) values ('race', ${holderClientId}, 'Race', 1)`;
          held();
          await committed;
        });
        await holdsSlug;

        const attempt = push('put', '/internal/novels/race', { body });
        await waitUntilBlocked(probe);
        commit();
        await holding;
        return await attempt;
      } finally {
        commit();
        await Promise.all([holder.close(), probe.close()]);
      }
    }

    it('should answer WBN_010 when the insert loses the slug unique index to another publisher', async () => {
      const response = await raceTheSlugIndex(INGEST_CLIENT_ID, novelBody(5, { title: 'Race' }));
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'WBN_010' });

      const [novel] = await env.getPostgresClient().select().from(schema.novels).where(eq(schema.novels.slug, 'race'));
      expect(novel).toMatchObject({ title: 'Race', revision: 1, sourceClientId: INGEST_CLIENT_ID });
    });

    /**
     * A publisher's own two converge passes race the same way, and reading that as foreign ownership would send
     * the forge off to re-slug and publish a second copy of the novel it just created.
     */
    it('should converge on its own row when the insert loses the slug unique index to itself', async () => {
      const response = await raceTheSlugIndex(FORGE_CLIENT_ID, novelBody(5, { title: 'Race II' }));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ slug: 'race', outcome: 'applied', revision: 5 });

      const novels = await env.getPostgresClient().select().from(schema.novels).where(eq(schema.novels.slug, 'race'));
      expect(novels).toHaveLength(1);
      expect(novels[0]).toMatchObject({ title: 'Race II', revision: 5, sourceClientId: FORGE_CLIENT_ID });

      // The rolled-back first attempt must leave no trace: one audit row, written by the pass that converged.
      const rows = (await auditRows()).filter(row => row.novelSlug === 'race');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'novel.upsert', outcome: 'applied', incomingRevision: 5, storedRevision: 1 });
    });

    it('should let the owning publisher keep mutating its own novel', async () => {
      await publishNovel(1);
      await foreign('put', `/internal/novels/${SLUG}`, novelBody(9, { title: 'Hijacked' }));

      const metadata = await push('put', `/internal/novels/${SLUG}`, { body: novelBody(2, { title: 'Moonfall II' }) });
      expect(metadata.statusCode).toBe(200);
      const chapter = await push('put', `/internal/novels/${SLUG}/chapters/1`, { body: chapterBody(1) });
      expect(chapter.statusCode).toBe(200);
      const manifest = await push('get', `/internal/novels/${SLUG}/manifest`);
      expect(manifest.json()).toEqual([{ ordinal: 1, contentHash: CHAPTER_HASH, revision: 1 }]);
    });
  });
});
