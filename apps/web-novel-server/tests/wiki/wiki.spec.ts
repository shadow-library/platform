import { beforeEach, describe, expect, it } from 'bun:test';

import { schema } from '@server/modules/datastore';

import { TestEnvironment } from '../test-environment';
import { FORGE_CLIENT_ID, userToken } from '../test-idp';

const env = new TestEnvironment('wiki').init();

async function seedNovel(slug = 'moonfall', visibility: 'PUBLIC' | 'RESTRICTED' = 'PUBLIC'): Promise<bigint> {
  const db = env.getPostgresClient();
  const [novel] = await db
    .insert(schema.novels)
    .values({ slug, sourceClientId: FORGE_CLIENT_ID, sourceRef: slug, title: 'Moonfall', genres: ['Fantasy'], visibility, revision: 1, accessRevision: 1 })
    .returning();
  const novelId = (novel as { id: bigint }).id;

  const [alice] = await db
    .insert(schema.wikiEntries)
    .values({ novelId, entryKey: 'alice', type: 'character', name: 'Alice', imageRef: 'alice.webp', firstVisibleOrdinal: 0, contentHash: 'a1', revision: 1 })
    .returning();
  const aliceId = (alice as { id: bigint }).id;
  await db.insert(schema.wikiEntries).values([
    { novelId, entryKey: 'bob', type: 'character', name: 'Bob', firstVisibleOrdinal: 3, contentHash: 'b1', revision: 1 },
    { novelId, entryKey: 'zoran', type: 'character', name: 'Zoran', firstVisibleOrdinal: 10, contentHash: 'z1', revision: 1 },
  ]);
  await db.insert(schema.wikiEntryFacets).values([
    { entryId: aliceId, facetKey: 'bio', content: 'A cartographer.', sortOrder: 0, visibleFromOrdinal: 0 },
    { entryId: aliceId, facetKey: 'secret', content: 'She caused the fall.', sortOrder: 1, visibleFromOrdinal: 5 },
  ]);
  await db.insert(schema.wikiEntryImages).values([
    { entryId: aliceId, imageRef: 'alice-portrait.webp', caption: 'Portrait', sortOrder: 0, visibleFromOrdinal: 0 },
    { entryId: aliceId, imageRef: 'alice-reveal.webp', caption: 'The truth', sortOrder: 1, visibleFromOrdinal: 8 },
  ]);
  return novelId;
}

async function setGate(userId: string, novelId: bigint, furthestOrdinal: number): Promise<void> {
  await env.getPostgresClient().insert(schema.readingProgress).values({ userId, novelId, ordinal: furthestOrdinal, position: 0, furthestOrdinal });
}

async function read(path: string, sub?: string) {
  const bearer = sub ? await userToken(sub) : undefined;
  const mock = env.getRouter().mockRequest().get(path);
  return bearer ? mock.headers({ authorization: `Bearer ${bearer}` }) : mock;
}

describe('Public wiki API', () => {
  describe('GET /api/novels/:slug/wiki', () => {
    beforeEach(() => seedNovel());

    it('should show only pre-reading entries and a locked count to an anonymous reader', async () => {
      const response = await read('/api/novels/moonfall/wiki');
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: { entryKey: string; imageUrl?: string }[]; lockedCount: number };
      expect(body.items.map(item => item.entryKey)).toEqual(['alice']);
      expect(body.lockedCount).toBe(2);
      expect(body.items[0]?.imageUrl).toMatch(/\/alice\.webp$/);
    });

    it('should widen the visible set and shrink the locked count as the gate advances', async () => {
      const novelId = await seedNovel('gate-novel');
      await setGate('reader-1', novelId, 5);

      const body = (await read('/api/novels/gate-novel/wiki', 'reader-1')).json() as { items: { entryKey: string }[]; lockedCount: number };
      expect(body.items.map(item => item.entryKey)).toEqual(['alice', 'bob']);
      expect(body.lockedCount).toBe(1);
    });

    it('should reveal every entry once the gate passes the furthest reveal', async () => {
      const novelId = await seedNovel('full-novel');
      await setGate('reader-1', novelId, 20);

      const body = (await read('/api/novels/full-novel/wiki', 'reader-1')).json() as { items: { entryKey: string }[]; lockedCount: number };
      expect(body.items.map(item => item.entryKey)).toEqual(['alice', 'bob', 'zoran']);
      expect(body.lockedCount).toBe(0);
    });

    it('should omit imageUrl for an entry with no image', async () => {
      const novelId = await seedNovel('img-novel');
      await setGate('reader-1', novelId, 5);
      const body = (await read('/api/novels/img-novel/wiki', 'reader-1')).json() as { items: { entryKey: string; imageUrl?: string }[] };
      expect(body.items.find(item => item.entryKey === 'bob')).not.toHaveProperty('imageUrl');
    });
  });

  describe('GET /api/novels/:slug/wiki/:entryKey', () => {
    beforeEach(() => seedNovel());

    it('should return a visible entry with only its unlocked facets and images, plus a hidden count', async () => {
      const response = await read('/api/novels/moonfall/wiki/alice');
      expect(response.statusCode).toBe(200);
      const body = response.json() as { entryKey: string; facets: { facetKey: string }[]; images: { imageUrl: string }[]; hiddenFacetCount: number };
      expect(body.entryKey).toBe('alice');
      expect(body.facets.map(facet => facet.facetKey)).toEqual(['bio']);
      expect(body.hiddenFacetCount).toBe(1);
      expect(body.images).toHaveLength(1);
      expect(body.images[0]?.imageUrl).toMatch(/\/alice-portrait\.webp$/);
    });

    it('should unlock the gated facet and image once the reader has reached them', async () => {
      const novelId = await seedNovel('detail-novel');
      await setGate('reader-1', novelId, 8);

      const body = (await read('/api/novels/detail-novel/wiki/alice', 'reader-1')).json() as { facets: { facetKey: string }[]; images: unknown[]; hiddenFacetCount: number };
      expect(body.facets.map(facet => facet.facetKey)).toEqual(['bio', 'secret']);
      expect(body.hiddenFacetCount).toBe(0);
      expect(body.images).toHaveLength(2);
    });

    it('should answer 404 for an entry beyond the gate, byte-identical to a nonexistent one', async () => {
      const hidden = await read('/api/novels/moonfall/wiki/bob');
      const missing = await read('/api/novels/moonfall/wiki/nobody');
      expect(hidden.statusCode).toBe(404);
      expect(missing.statusCode).toBe(404);
      expect(hidden.json()).toMatchObject({ code: 'WBN_009' });
      expect(hidden.json()).toEqual(missing.json());
    });
  });

  describe('caching', () => {
    beforeEach(() => seedNovel());

    it('should serve a public novel read anonymously as CDN-cacheable with an ETag', async () => {
      const response = await read('/api/novels/moonfall/wiki');
      expect(response.headers['cache-control']).toContain('public, max-age=');
      expect(response.headers.etag).toBeString();
    });

    it('should answer 304 when the ETag still matches', async () => {
      const first = await read('/api/novels/moonfall/wiki');
      const etag = first.headers.etag as string;
      const second = await env.getRouter().mockRequest().get('/api/novels/moonfall/wiki').headers({ 'if-none-match': etag });
      expect(second.statusCode).toBe(304);
    });

    it('should never let a shared cache hold a reader-specific response', async () => {
      const novelId = await seedNovel('cache-novel');
      await setGate('reader-1', novelId, 5);
      const response = await read('/api/novels/cache-novel/wiki', 'reader-1');
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers.vary).toBe('Cookie, Authorization');
    });
  });

  describe('access control', () => {
    it('should hide a restricted novel’s wiki behind the same 404 the catalog gives', async () => {
      const novelId = await seedNovel('secret-novel', 'RESTRICTED');

      expect((await read('/api/novels/secret-novel/wiki')).statusCode).toBe(404);
      expect((await read('/api/novels/secret-novel/wiki', 'stranger')).json()).toMatchObject({ code: 'WBN_001' });
      expect((await read('/api/novels/secret-novel/wiki/alice', 'stranger')).json()).toMatchObject({ code: 'WBN_001' });

      await env.getPostgresClient().insert(schema.novelGrants).values({ novelId, subjectId: 'grantee-1' });
      expect((await read('/api/novels/secret-novel/wiki', 'grantee-1')).statusCode).toBe(200);
    });
  });
});
