import { afterAll, describe, expect, it } from 'bun:test';
import { type AuthAccessMode } from '@shadow-library/auth';
import { AuthAccessPolicy } from '@shadow-library/auth/module';
import { setConfig } from '@shadow-library/common/testing';

import { CatalogController, type CatalogService, type NovelCatalogQuery } from '@modules/catalog';
import { type NOVEL_VISIBILITIES } from '@modules/publish';

import { anonymousContext, fakeRequest, FakeResponse } from '../fake-http';

type Visibility = (typeof NOVEL_VISIBILITIES)[number];

const CONTENT_HASH = 'hash-1';
const SHARED = 'public, max-age=300';
const NO_STORE = 'private, no-store';
const CATALOG_QUERY: NovelCatalogQuery = { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' };

const restoreConfig = setConfig({ 'catalog.cache-max-age': 300 });
afterAll(restoreConfig);

function controllerFor(mode: AuthAccessMode, visibility: Visibility): CatalogController {
  const catalogService = {
    listNovels: () => Promise.resolve({ items: [] }),
    getNovel: () => Promise.resolve({ slug: 'the-novel', visibility }),
    listChapters: () => Promise.resolve({ items: [], visibility }),
    getChapterRef: () => Promise.resolve({ novelSlug: 'the-novel', chapterId: 1n, ordinal: 1, contentHash: CONTENT_HASH, revision: 1, visibility }),
    getChapterContent: () => Promise.resolve({ ordinal: 1 }),
  } as unknown as CatalogService;
  return new CatalogController(catalogService, anonymousContext, new AuthAccessPolicy(mode));
}

const READS = {
  getNovel: (controller: CatalogController, response: FakeResponse) => controller.getNovel({ slug: 'the-novel' }, response.asHttpResponse()),
  listChapters: (controller: CatalogController, response: FakeResponse) => controller.listChapters({ slug: 'the-novel' }, response.asHttpResponse()),
  getChapter: (controller: CatalogController, response: FakeResponse) => controller.getChapter({ slug: 'the-novel', ordinal: 1 }, fakeRequest(), response.asHttpResponse()),
};

const CASES: { mode: AuthAccessMode; visibility: Visibility; cacheControl: string }[] = [
  { mode: 'public', visibility: 'PUBLIC', cacheControl: SHARED },
  { mode: 'public', visibility: 'RESTRICTED', cacheControl: NO_STORE },
  { mode: 'public', visibility: 'ORGANISATION', cacheControl: NO_STORE },
  { mode: 'private', visibility: 'PUBLIC', cacheControl: NO_STORE },
  { mode: 'private', visibility: 'RESTRICTED', cacheControl: NO_STORE },
];

describe('CatalogController', () => {
  for (const [read, run] of Object.entries(READS)) {
    for (const { mode, visibility, cacheControl } of CASES) {
      it(`should answer ${read} for a ${visibility} novel in ${mode} mode with '${cacheControl}'`, async () => {
        const response = new FakeResponse();
        await run(controllerFor(mode, visibility), response);

        expect(response.headers.get('cache-control')).toBe(cacheControl);
        expect(response.headers.get('vary')).toBe(cacheControl === SHARED ? undefined : 'Cookie, Authorization');
      });
    }
  }

  for (const { mode, visibility, cacheControl } of CASES) {
    it(`should keep '${cacheControl}' on a 304 for a ${visibility} chapter in ${mode} mode`, async () => {
      const response = new FakeResponse();
      const body = await controllerFor(mode, visibility).getChapter({ slug: 'the-novel', ordinal: 1 }, fakeRequest(`W/"${CONTENT_HASH}"`), response.asHttpResponse());

      expect(body).toBeUndefined();
      expect(response.statusCode).toBe(304);
      expect(response.headers.get('etag')).toBe(`"${CONTENT_HASH}"`);
      expect(response.headers.get('cache-control')).toBe(cacheControl);
    });
  }

  it('should leave the catalog listing without cache directives in public mode', async () => {
    const response = new FakeResponse();
    await controllerFor('public', 'PUBLIC').listNovels(CATALOG_QUERY, response.asHttpResponse());

    expect(response.headers.get('cache-control')).toBeUndefined();
  });

  it('should keep the catalog listing out of shared caches in private mode', async () => {
    const response = new FakeResponse();
    await controllerFor('private', 'PUBLIC').listNovels(CATALOG_QUERY, response.asHttpResponse());

    expect(response.headers.get('cache-control')).toBe(NO_STORE);
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
  });
});
