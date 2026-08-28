import { describe, expect, it } from 'bun:test';

import { asc, eq } from 'drizzle-orm';

import { schema } from '@server/modules/datastore';

import { TestEnvironment } from '../test-environment';
import { forgeToken, userToken } from '../test-idp';

interface PushOptions {
  body?: object;
  token?: string;
}

const env = new TestEnvironment('wiki-ingest').init();
const SLUG = 'moonfall';

const entryBody = (revision: number, contentHash: string, overrides: object = {}) => ({
  type: 'character',
  name: 'Alice Marlowe',
  firstVisibleOrdinal: 0,
  contentHash,
  revision,
  facets: [
    { facetKey: 'bio', content: 'A cartographer of falling skies.', sortOrder: 0, visibleFromOrdinal: 0 },
    { facetKey: 'secret', content: 'She caused the fall.', sortOrder: 1, visibleFromOrdinal: 12 },
  ],
  images: [{ imageRef: 'alice.webp', caption: 'Alice', sortOrder: 0, visibleFromOrdinal: 0 }],
  ...overrides,
});

async function push(method: 'put' | 'delete' | 'get', path: string, options: PushOptions = {}) {
  const bearer = options.token ?? (await forgeToken());
  const mock = env.getRouter().mockRequest();
  const chain = mock[method](path).headers({ authorization: `Bearer ${bearer}` });
  return options.body ? chain.body(options.body) : chain;
}

const novelBody = (revision = 1) => ({ sourceRef: 'forge-moonfall', title: 'Moonfall', genres: ['Fantasy'], status: 'live', visibility: 'PUBLIC', revision });
const publishNovel = async () => expect((await push('put', `/internal/novels/${SLUG}`, { body: novelBody() })).statusCode).toBe(200);

const entryRows = () => env.getPostgresClient().select().from(schema.wikiEntries).orderBy(asc(schema.wikiEntries.entryKey));
const facetRows = (entryId: bigint) =>
  env.getPostgresClient().select().from(schema.wikiEntryFacets).where(eq(schema.wikiEntryFacets.entryId, entryId)).orderBy(asc(schema.wikiEntryFacets.sortOrder));
const auditRows = () => env.getPostgresClient().select().from(schema.publishAuditLog).orderBy(asc(schema.publishAuditLog.id));

describe('Internal wiki ingest API', () => {
  describe('wiki entry upsert', () => {
    it('should create the entry with its facets and images and record an applied audit row', async () => {
      await publishNovel();
      const response = await push('put', `/internal/novels/${SLUG}/wiki/alice`, { body: entryBody(1, 'hash-a') });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ slug: SLUG, entryKey: 'alice', outcome: 'applied', revision: 1 });

      const [entry] = await entryRows();
      expect(entry).toMatchObject({ entryKey: 'alice', type: 'character', name: 'Alice Marlowe', firstVisibleOrdinal: 0, contentHash: 'hash-a', revision: 1 });
      expect(await facetRows((entry as { id: bigint }).id)).toHaveLength(2);

      const rows = await auditRows();
      expect(rows[rows.length - 1]).toMatchObject({ action: 'wiki.upsert', novelSlug: SLUG, contentHash: 'hash-a', incomingRevision: 1, storedRevision: null, outcome: 'applied' });
    });

    it('should answer 204 no-op when the revision and content hash both match', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/wiki/alice`, { body: entryBody(1, 'hash-a') });
      const response = await push('put', `/internal/novels/${SLUG}/wiki/alice`, { body: entryBody(1, 'hash-a') });
      expect(response.statusCode).toBe(204);
      expect((await auditRows()).at(-1)).toMatchObject({ action: 'wiki.upsert', outcome: 'noop', incomingRevision: 1, storedRevision: 1 });
    });

    it('should reject a stale revision with 409 and keep the stored entry', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/wiki/alice`, { body: entryBody(4, 'hash-d') });
      const response = await push('put', `/internal/novels/${SLUG}/wiki/alice`, { body: entryBody(3, 'hash-c', { name: 'Stale Name' }) });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'WBN_003' });

      const [entry] = await entryRows();
      expect(entry).toMatchObject({ name: 'Alice Marlowe', contentHash: 'hash-d', revision: 4 });
      expect((await auditRows()).at(-1)).toMatchObject({ action: 'wiki.upsert', outcome: 'stale_rejected', incomingRevision: 3, storedRevision: 4 });
    });

    it('should fully replace facets and images on an equal-revision push with a new content hash', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/wiki/alice`, { body: entryBody(2, 'hash-a') });
      const replaced = await push('put', `/internal/novels/${SLUG}/wiki/alice`, {
        body: entryBody(2, 'hash-b', { facets: [{ facetKey: 'bio', content: 'Rewritten.', sortOrder: 0, visibleFromOrdinal: 0 }], images: [] }),
      });
      expect(replaced.statusCode).toBe(200);

      const [entry] = await entryRows();
      expect(entry).toMatchObject({ contentHash: 'hash-b', revision: 2 });
      const facets = await facetRows((entry as { id: bigint }).id);
      expect(facets).toHaveLength(1);
      expect(facets[0]).toMatchObject({ facetKey: 'bio', content: 'Rewritten.' });
      const images = await env
        .getPostgresClient()
        .select()
        .from(schema.wikiEntryImages)
        .where(eq(schema.wikiEntryImages.entryId, (entry as { id: bigint }).id));
      expect(images).toHaveLength(0);
    });

    it('should answer 404 for an unknown novel and record an error audit row', async () => {
      const response = await push('put', '/internal/novels/ghost/wiki/alice', { body: entryBody(1, 'hash-a') });
      expect(response.statusCode).toBe(404);
      expect((await auditRows()).at(-1)).toMatchObject({ action: 'wiki.upsert', novelSlug: 'ghost', outcome: 'error' });
    });

    it('should reject an end-user token with 403', async () => {
      await publishNovel();
      const token = await userToken('reader-1');
      const response = await push('put', `/internal/novels/${SLUG}/wiki/alice`, { body: entryBody(1, 'hash-a'), token });
      expect(response.statusCode).toBe(403);
      expect(await entryRows()).toHaveLength(0);
    });
  });

  describe('wiki entry delete', () => {
    it('should delete the entry, record applied, and stay idempotent with a noop on repeat', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/wiki/alice`, { body: entryBody(1, 'hash-a') });

      const first = await push('delete', `/internal/novels/${SLUG}/wiki/alice`);
      expect(first.statusCode).toBe(204);
      expect(await entryRows()).toHaveLength(0);

      const second = await push('delete', `/internal/novels/${SLUG}/wiki/alice`);
      expect(second.statusCode).toBe(204);

      const rows = await auditRows();
      expect(rows.at(-2)).toMatchObject({ action: 'wiki.delete', outcome: 'applied', storedRevision: 1, contentHash: 'hash-a' });
      expect(rows.at(-1)).toMatchObject({ action: 'wiki.delete', outcome: 'noop' });
    });

    it('should stay a noop for an unknown novel', async () => {
      const response = await push('delete', '/internal/novels/ghost/wiki/alice');
      expect(response.statusCode).toBe(204);
      expect((await auditRows()).at(-1)).toMatchObject({ action: 'wiki.delete', novelSlug: 'ghost', outcome: 'noop' });
    });
  });

  describe('manifest', () => {
    it('should reflect the served entries exactly, ordered by entry key', async () => {
      await publishNovel();
      await push('put', `/internal/novels/${SLUG}/wiki/alice`, { body: entryBody(1, 'hash-a') });
      await push('put', `/internal/novels/${SLUG}/wiki/bob`, { body: entryBody(1, 'hash-b', { name: 'Bob' }) });
      await push('put', `/internal/novels/${SLUG}/wiki/carol`, { body: entryBody(1, 'hash-c', { name: 'Carol' }) });
      await push('delete', `/internal/novels/${SLUG}/wiki/bob`);
      await push('put', `/internal/novels/${SLUG}/wiki/alice`, { body: entryBody(2, 'hash-a2') });

      const response = await push('get', `/internal/novels/${SLUG}/wiki/manifest`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        { entryKey: 'alice', revision: 2, contentHash: 'hash-a2' },
        { entryKey: 'carol', revision: 1, contentHash: 'hash-c' },
      ]);
    });

    it('should answer 404 for an unknown novel without writing an audit row', async () => {
      const before = (await auditRows()).length;
      const response = await push('get', '/internal/novels/ghost/wiki/manifest');
      expect(response.statusCode).toBe(404);
      expect((await auditRows()).length).toBe(before);
    });
  });
});
