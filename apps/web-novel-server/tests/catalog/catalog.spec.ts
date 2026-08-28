import { beforeEach, describe, expect, it } from 'bun:test';

import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { schema } from '@server/modules/datastore';

import { TestEnvironment } from '../test-environment';
import { FORGE_CLIENT_ID, forgeToken } from '../test-idp';

const env = new TestEnvironment('catalog').init();

const seedCatalog = async () => {
  const db = env.getPostgresClient();
  const [aurora] = await db
    .insert(schema.novels)
    .values([
      {
        slug: 'aurora-blade',
        sourceClientId: FORGE_CLIENT_ID,
        sourceRef: 'forge-aurora-blade',
        title: 'Aurora Blade',
        blurb: 'Steel under polar light',
        coverPath: 'aurora-blade-cover.jpg',
        genres: ['Fantasy', 'Action'],
        tags: ['Slow Romance'],
        sexualContent: 'moderate',
        violence: 'mild',
        darkContent: 'mild',
        status: 'live',
        revision: 1,
        updatedAt: new Date('2026-01-03'),
      },
      {
        slug: 'silent-harbor',
        sourceClientId: FORGE_CLIENT_ID,
        sourceRef: 'forge-silent-harbor',
        title: 'Silent Harbor',
        genres: ['Mystery'],
        tags: ['Slow Romance'],
        sexualContent: 'explicit',
        violence: 'extreme',
        darkContent: 'heavy',
        status: 'live',
        revision: 1,
        updatedAt: new Date('2026-01-02'),
      },
      {
        slug: 'old-embers',
        sourceClientId: FORGE_CLIENT_ID,
        sourceRef: 'forge-old-embers',
        title: 'Old Embers',
        genres: ['Fantasy'],
        status: 'retired',
        revision: 1,
        updatedAt: new Date('2026-01-01'),
      },
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
        genres: ['Fantasy', 'Action'],
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
      const response = await env.getRouter().mockRequest().get('/api/novels?genre=Fantasy');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.total).toBe(2);
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade', 'old-embers']);
    });

    it('should reject an unrecognised genre at the boundary', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?genre=NotARealGenre');
      expect(response.statusCode).toBe(422);
    });

    it('should filter by tag', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?tag=Slow+Romance');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.total).toBe(2);
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade', 'silent-harbor']);
    });

    it('should reject an unrecognised tag at the boundary', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?tag=NotARealTag');
      expect(response.statusCode).toBe(422);
    });

    it('should return novels at or below a sexual-content ceiling, in rank order not alphabetical order', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?maxSexualContent=moderate');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade']);
      expect(body.total).toBe(1);
    });

    it('should exclude an unrated novel under any rating ceiling', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?maxSexualContent=explicit');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade', 'silent-harbor']);
      expect(body.items.map(item => item.slug)).not.toContain('old-embers');
    });

    it('should reject an unrecognised sexual-content ceiling at the boundary', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?maxSexualContent=nope');
      expect(response.statusCode).toBe(422);
    });

    it('should return novels at or below a violence ceiling, in rank order not alphabetical order', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?maxViolence=mild');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade']);
      expect(body.total).toBe(1);
    });

    it('should exclude an unrated novel under the widest violence ceiling', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?maxViolence=extreme');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade', 'silent-harbor']);
      expect(body.items.map(item => item.slug)).not.toContain('old-embers');
    });

    it('should return novels at or below a dark-content ceiling, in rank order not alphabetical order', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?maxDarkContent=mild');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade']);
      expect(body.total).toBe(1);
    });

    it('should exclude an unrated novel under the widest dark-content ceiling', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels?maxDarkContent=heavy');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.items.map(item => item.slug)).toEqual(['aurora-blade', 'silent-harbor']);
      expect(body.items.map(item => item.slug)).not.toContain('old-embers');
    });

    it('should include an unrated novel when no rating filter is supplied', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels');
      const body = response.json() as { total: number; items: { slug: string }[] };
      expect(body.items.map(item => item.slug)).toContain('old-embers');
    });

    it('should serialise tags and ratings for a rated novel, and omit the rating field entirely for an unrated one', async () => {
      const response = await env.getRouter().mockRequest().get('/api/novels');
      const body = response.json() as { items: Record<string, unknown>[] };
      const rated = body.items.find(item => item.slug === 'aurora-blade');
      const unrated = body.items.find(item => item.slug === 'old-embers');
      expect(rated).toMatchObject({ tags: ['Slow Romance'], sexualContent: 'moderate' });
      expect(unrated).not.toHaveProperty('sexualContent');
      expect(unrated).not.toHaveProperty('violence');
      expect(unrated).not.toHaveProperty('darkContent');
      expect(unrated?.sexualContent).not.toBe('none');
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

    const publishChapter = async (revision: number, content: string) => {
      const contentHash = chapterContentHash({ title: 'One', content });
      await publish('/internal/novels/etag-novel', { sourceRef: 'forge-etag-novel', title: 'ETag Novel', genres: [], visibility: 'PUBLIC', revision: 1 });
      await publish('/internal/novels/etag-novel/chapters/1', { title: 'One', content, contentHash, revision });
      return contentHash;
    };

    it('should serve the chapter with the contentHash as ETag and public cache headers', async () => {
      const contentHash = await publishChapter(1, 'The first draft of history.');
      const response = await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/1');
      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toBe(`"${contentHash}"`);
      expect(response.headers['cache-control']).toBe('public, max-age=300');
      expect(response.json()).toMatchObject({ novelSlug: 'etag-novel', ordinal: 1, title: 'One', content: 'The first draft of history.', revision: 1 });
    });

    it('should answer 304 for a matching If-None-Match, including weak tags', async () => {
      const contentHash = await publishChapter(1, 'The first draft of history.');
      const exact = await env
        .getRouter()
        .mockRequest()
        .get('/api/novels/etag-novel/chapters/1')
        .headers({ 'if-none-match': `"${contentHash}"` });
      expect(exact.statusCode).toBe(304);
      expect(exact.body).toBe('');
      expect(exact.headers.etag).toBe(`"${contentHash}"`);

      const weak = await env
        .getRouter()
        .mockRequest()
        .get('/api/novels/etag-novel/chapters/1')
        .headers({ 'if-none-match': `W/"${contentHash}"` });
      expect(weak.statusCode).toBe(304);
    });

    it('should serve fresh content when the If-None-Match no longer matches after a republish', async () => {
      const staleHash = await publishChapter(1, 'The first draft of history.');
      const freshContent = 'The corrected draft.';
      const freshHash = chapterContentHash({ title: 'One', content: freshContent });
      await publish('/internal/novels/etag-novel/chapters/1', { title: 'One', content: freshContent, contentHash: freshHash, revision: 2 });

      const response = await env
        .getRouter()
        .mockRequest()
        .get('/api/novels/etag-novel/chapters/1')
        .headers({ 'if-none-match': `"${staleHash}"` });
      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toBe(`"${freshHash}"`);
      expect(response.json()).toMatchObject({ content: freshContent, revision: 2 });
    });

    it('should never serve a stale cached body for an equal-revision republish', async () => {
      await publishChapter(3, 'Original text.');
      await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/1');
      const freshContent = 'Silently patched text.';
      const freshHash = chapterContentHash({ title: 'One', content: freshContent });
      await publish('/internal/novels/etag-novel/chapters/1', { title: 'One', content: freshContent, contentHash: freshHash, revision: 3 });

      const response = await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/1');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ content: freshContent, revision: 3 });
    });

    it('should answer 404 for an unknown chapter', async () => {
      await publish('/internal/novels/etag-novel', { sourceRef: 'forge-etag-novel', title: 'ETag Novel', genres: [], visibility: 'PUBLIC', revision: 1 });
      const response = await env.getRouter().mockRequest().get('/api/novels/etag-novel/chapters/99');
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'WBN_002' });
    });
  });
});
