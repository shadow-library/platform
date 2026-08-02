/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { schema } from '@server/modules/datastore';

import { TestEnvironment } from '../test-environment';
import { forgeToken } from '../test-idp';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const env = new TestEnvironment('catalog').init();

const seedCatalog = async () => {
  const db = env.getPostgresClient();
  const [aurora] = await db
    .insert(schema.novels)
    .values([
      {
        slug: 'aurora-blade',
        title: 'Aurora Blade',
        blurb: 'Steel under polar light',
        coverPath: 'aurora-blade-cover.jpg',
        genres: ['fantasy', 'action'],
        status: 'live',
        revision: 1,
        updatedAt: new Date('2026-01-03'),
      },
      { slug: 'silent-harbor', title: 'Silent Harbor', genres: ['mystery'], status: 'live', revision: 1, updatedAt: new Date('2026-01-02') },
      { slug: 'old-embers', title: 'Old Embers', genres: ['fantasy'], status: 'retired', revision: 1, updatedAt: new Date('2026-01-01') },
    ])
    .returning();
  await db.insert(schema.publishedChapters).values([
    {
      novelId: (aurora as { id: bigint }).id,
      ordinal: 1,
      title: 'First Light',
      content: 'The blade woke.',
      contentHash: 'ab-1',
      revision: 1,
      wordCount: 3,
      publishedAt: new Date(),
    },
    { novelId: (aurora as { id: bigint }).id, ordinal: 2, title: 'Second Light', content: 'It spoke.', contentHash: 'ab-2', revision: 1, wordCount: 2, publishedAt: new Date() },
  ]);
};

describe('Public catalog API', () => {
  describe('GET /api/novels', () => {
    beforeEach(seedCatalog);

    it('should list the catalog sorted by recency with chapter counts', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels');
      expect(response.statusCode).toBe(200);
      const body = response.json() as { total: number; limit: number; offset: number; items: { slug: string; chapterCount: number }[] };
      expect(body.total).toBe(3);
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade', 'silent-harbor', 'old-embers']);
      expect(body.items[0]).toMatchObject({
        slug: 'aurora-blade',
        title: 'Aurora Blade',
        genres: ['fantasy', 'action'],
        status: 'live',
        chapterCount: 2,
        coverUrl: 'http://localhost:9000/wiki-assets/aurora-blade-cover.jpg',
      });
    });

    it('should search titles case-insensitively', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?search=HARBOR');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.total).toBe(1);
      expect(body.items[0]?.slug).toBe('silent-harbor');
    });

    it('should filter by genre', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?genre=fantasy');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.total).toBe(2);
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade', 'old-embers']);
    });

    it('should filter by status', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?status=retired');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.total).toBe(1);
      expect(body.items[0]?.slug).toBe('old-embers');
    });

    it('should paginate with a stable total', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?limit=1&offset=1');
      const body = response.json() as { total: number; limit: number; offset: number; items: { slug: string }[] };
      expect(body).toMatchObject({ total: 3, limit: 1, offset: 1 });
      expect(body.items.map(item => item.slug)).toEqual(['silent-harbor']);
    });

    it('should sort by title ascending on request', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?sortBy=title&sortOrder=asc');
      const body = response.json() as { items: { slug: string }[] };
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade', 'old-embers', 'silent-harbor']);
    });
  });

  describe('GET /api/novels/:slug', () => {
    beforeEach(seedCatalog);

    it('should return the novel detail', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels/aurora-blade');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        slug: 'aurora-blade',
        title: 'Aurora Blade',
        blurb: 'Steel under polar light',
        chapterCount: 2,
        status: 'live',
        coverUrl: 'http://localhost:9000/wiki-assets/aurora-blade-cover.jpg',
      });
    });

    it('should answer 404 for an unknown novel', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels/unknown-novel');
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'WBN_001' });
    });
  });

  describe('GET /api/novels/:slug/chapters', () => {
    beforeEach(seedCatalog);

    it('should list chapter metadata without content', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels/aurora-blade/chapters');
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Record<string, unknown>[] };
      expect(body.items).toHaveLength(2);
      expect(body.items[0]).toMatchObject({ ordinal: 1, title: 'First Light', wordCount: 3 });
      expect(body.items[0]).not.toHaveProperty('content');
    });
  });

  describe('GET /api/novels/:slug/chapters/:ordinal', () => {
    const publish = async (path: string, body: object) => {
      const token = await forgeToken();
      const response = await env
        .getRouter()
        .mockRequest()
        .put(path)
        .headers({ authorization: `Bearer ${token}` })
        .body(body);
      expect([200, 204]).toContain(response.statusCode);
    };

    const publishChapter = async (revision: number, contentHash: string, content: string) => {
      await publish('/internal/novels/etag-novel', { title: 'ETag Novel', genres: [], visibility: 'PUBLIC', revision: 1 });
      await publish('/internal/novels/etag-novel/chapters/1', { title: 'One', content, contentHash, revision });
    };

    it('should serve the chapter with the contentHash as ETag and public cache headers', async () => {
      await publishChapter(1, 'hash-a', 'The first draft of history.');
      const response = await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/1');
      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toBe('"hash-a"');
      expect(response.headers['cache-control']).toBe('public, max-age=300');
      expect(response.json()).toMatchObject({ novelSlug: 'etag-novel', ordinal: 1, title: 'One', content: 'The first draft of history.', revision: 1 });
    });

    it('should answer 304 for a matching If-None-Match, including weak tags', async () => {
      await publishChapter(1, 'hash-a', 'The first draft of history.');
      const exact = await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/1').headers({ 'if-none-match': '"hash-a"' });
      expect(exact.statusCode).toBe(304);
      expect(exact.body).toBe('');
      expect(exact.headers.etag).toBe('"hash-a"');

      const weak = await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/1').headers({ 'if-none-match': 'W/"hash-a"' });
      expect(weak.statusCode).toBe(304);
    });

    it('should serve fresh content when the If-None-Match no longer matches after a republish', async () => {
      await publishChapter(1, 'hash-a', 'The first draft of history.');
      await publish('/internal/novels/etag-novel/chapters/1', { title: 'One', content: 'The corrected draft.', contentHash: 'hash-b', revision: 2 });

      const response = await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/1').headers({ 'if-none-match': '"hash-a"' });
      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toBe('"hash-b"');
      expect(response.json()).toMatchObject({ content: 'The corrected draft.', revision: 2 });
    });

    it('should never serve a stale cached body for an equal-revision republish', async () => {
      await publishChapter(3, 'hash-a', 'Original text.');
      await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/1');
      await publish('/internal/novels/etag-novel/chapters/1', { title: 'One', content: 'Silently patched text.', contentHash: 'hash-b', revision: 3 });

      const response = await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/1');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ content: 'Silently patched text.', revision: 3 });
    });

    it('should answer 404 for an unknown chapter', async () => {
      await publish('/internal/novels/etag-novel', { title: 'ETag Novel', genres: [], visibility: 'PUBLIC', revision: 1 });
      const response = await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/99');
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'WBN_002' });
    });
  });
});
