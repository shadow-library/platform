import { describe, expect, it } from 'bun:test';

import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { TestEnvironment } from '../test-environment';
import { forgeToken, userToken } from '../test-idp';

const env = new TestEnvironment('access').init();

const GRANTEE = '900001';
const OUTSIDER = '900002';
const ORG_MEMBER = '900003';
const ORG_ID = '4242';

const novelBody = (revision: number, overrides: object = {}) => ({
  title: 'The Quiet Archive',
  genres: ['Mystery'],
  status: 'live',
  visibility: 'PUBLIC',
  revision,
  ...overrides,
});

const CHAPTER_TITLE = 'Chapter One';
const CHAPTER_CONTENT = 'The archive kept better secrets than its keepers.';
const CHAPTER_HASH = chapterContentHash({ title: CHAPTER_TITLE, content: CHAPTER_CONTENT });

const chapterBody = (revision: number, overrides: object = {}) => ({ title: CHAPTER_TITLE, content: CHAPTER_CONTENT, contentHash: CHAPTER_HASH, revision, ...overrides });

async function push(method: 'put' | 'get', path: string, body?: object) {
  const bearer = await forgeToken();
  const request = env.getRouter().mockRequest();
  const chain = request[method](path).headers({ authorization: `Bearer ${bearer}` });
  return body ? chain.body(body) : chain;
}

/**
 * A reader request; omit `sub` to read anonymously, as the public catalog allows. The token is minted
 * *before* the chain is built — the mock chain dispatches on the next tick, so awaiting anything
 * between `.get()` and the last `.headers()` loses the header to an already-sent request.
 */
async function read(path: string, sub?: string, org?: string) {
  const bearer = sub ? await userToken(sub, org ? { org } : {}) : undefined;
  const mock = env.getRouter().mockRequest().get(path);
  return bearer ? mock.headers({ authorization: `Bearer ${bearer}` }) : mock;
}

async function seed(slug: string, visibility: string, access: object = {}): Promise<void> {
  expect((await push('put', `/internal/novels/${slug}`, novelBody(1, { visibility }))).statusCode).toBe(200);
  expect([200, 204]).toContain((await push('put', `/internal/novels/${slug}/access`, { visibility, revision: 1, ...access })).statusCode);
  expect((await push('put', `/internal/novels/${slug}/chapters/1`, chapterBody(1))).statusCode).toBe(200);
}

describe('Novel access', () => {
  describe('the internal access surface', () => {
    it('should replace the grant set and answer 200 applied', async () => {
      await seed('applied-novel', 'RESTRICTED', { subjectIds: [GRANTEE] });
      const response = await push('get', '/internal/novels/applied-novel/access');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ visibility: 'RESTRICTED', subjectIds: [GRANTEE], revision: 1 });
    });

    it('should answer 204 no-op when the revision and grant set are both unchanged', async () => {
      await seed('noop-novel', 'RESTRICTED', { subjectIds: [GRANTEE] });
      const repeat = await push('put', '/internal/novels/noop-novel/access', { visibility: 'RESTRICTED', subjectIds: [GRANTEE], revision: 1 });
      expect(repeat.statusCode).toBe(204);
    });

    it('should treat a reordered grant set as unchanged, since a share list has no order', async () => {
      await seed('order-novel', 'RESTRICTED', { subjectIds: [GRANTEE, OUTSIDER] });
      const reordered = await push('put', '/internal/novels/order-novel/access', { visibility: 'RESTRICTED', subjectIds: [OUTSIDER, GRANTEE], revision: 1 });
      expect(reordered.statusCode).toBe(204);
    });

    it('should reject a stale access revision with 409 and keep the stored grants', async () => {
      await seed('stale-novel', 'RESTRICTED', { subjectIds: [GRANTEE] });
      expect((await push('put', '/internal/novels/stale-novel/access', { visibility: 'RESTRICTED', subjectIds: [OUTSIDER], revision: 5 })).statusCode).toBe(200);

      const stale = await push('put', '/internal/novels/stale-novel/access', { visibility: 'RESTRICTED', subjectIds: [GRANTEE], revision: 2 });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: 'WBN_003' });
      expect((await push('get', '/internal/novels/stale-novel/access')).json()).toMatchObject({ subjectIds: [OUTSIDER], revision: 5 });
    });

    it('should refuse organisation visibility that names no organisation', async () => {
      await seed('org-missing', 'PUBLIC');
      const response = await push('put', '/internal/novels/org-missing/access', { visibility: 'ORGANISATION', revision: 2 });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'WBN_007' });
    });

    it('should refuse an organisation on a tier that would silently ignore it', async () => {
      await seed('org-extra', 'PUBLIC');
      const response = await push('put', '/internal/novels/org-extra/access', { visibility: 'PUBLIC', organisationId: ORG_ID, revision: 2 });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'WBN_008' });
    });

    it('should reject a novel push that carries no visibility, rather than defaulting it open', async () => {
      const response = await push('put', '/internal/novels/no-visibility', { title: 'Untiered', genres: [], revision: 1 });
      expect(response.statusCode).toBe(422);
    });

    it('should answer 404 for an access push against an unknown novel', async () => {
      const response = await push('put', '/internal/novels/ghost-novel/access', { visibility: 'PUBLIC', revision: 1 });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('the public catalog', () => {
    it('should list a public novel and never a restricted one, not even for its grantee', async () => {
      await seed('listed-public', 'PUBLIC');
      await seed('listed-private', 'RESTRICTED', { subjectIds: [GRANTEE] });

      for (const sub of [undefined, OUTSIDER, GRANTEE]) {
        const slugs = ((await read('/api/novels', sub)).json() as { items: { slug: string }[] }).items.map(item => item.slug);
        expect(slugs).toContain('listed-public');
        expect(slugs).not.toContain('listed-private');
      }
    });

    it('should keep a restricted novel out of search results as well as the default listing', async () => {
      await seed('search-private', 'RESTRICTED', { subjectIds: [GRANTEE] });
      const response = await read('/api/novels?search=Quiet', GRANTEE);
      expect((response.json() as { items: unknown[] }).items).toHaveLength(0);
    });

    it('should answer 404 for a restricted novel to anyone but its grantee', async () => {
      await seed('detail-private', 'RESTRICTED', { subjectIds: [GRANTEE] });

      expect((await read('/api/novels/detail-private')).statusCode).toBe(404);
      expect((await read('/api/novels/detail-private', OUTSIDER)).statusCode).toBe(404);
      expect((await read('/api/novels/unknown-slug')).json()).toMatchObject({ code: 'WBN_001' });
      expect((await read('/api/novels/detail-private', OUTSIDER)).json()).toMatchObject({ code: 'WBN_001' });

      const granted = await read('/api/novels/detail-private', GRANTEE);
      expect(granted.statusCode).toBe(200);
      expect(granted.json()).toMatchObject({ slug: 'detail-private', visibility: 'RESTRICTED' });
    });

    it('should gate the chapter list and chapter content on the same decision', async () => {
      await seed('content-private', 'RESTRICTED', { subjectIds: [GRANTEE] });

      expect((await read('/api/novels/content-private/chapters', OUTSIDER)).statusCode).toBe(404);
      expect((await read('/api/novels/content-private/chapters/1', OUTSIDER)).statusCode).toBe(404);
      expect((await read('/api/novels/content-private/chapters', GRANTEE)).statusCode).toBe(200);

      const chapter = await read('/api/novels/content-private/chapters/1', GRANTEE);
      expect(chapter.statusCode).toBe(200);
      expect(chapter.json()).toMatchObject({ content: 'The archive kept better secrets than its keepers.' });
    });

    it('should never let a shared cache hold a non-public response', async () => {
      await seed('cache-private', 'RESTRICTED', { subjectIds: [GRANTEE] });
      const chapter = await read('/api/novels/cache-private/chapters/1', GRANTEE);
      expect(chapter.headers['cache-control']).toBe('private, no-store');
      expect(chapter.headers['vary']).toBe('Cookie, Authorization');
    });

    it('should leave the public caching story exactly as it was', async () => {
      await seed('cache-public', 'PUBLIC');
      const chapter = await read('/api/novels/cache-public/chapters/1');
      expect(chapter.headers['cache-control']).toContain('public, max-age=');
      expect(chapter.headers['vary']).toBeUndefined();
      expect(chapter.headers['etag']).toBe(`"${CHAPTER_HASH}"`);
    });

    it('should admit a reader acting in the organisation a novel was shared with', async () => {
      await seed('org-novel', 'ORGANISATION', { organisationId: ORG_ID });

      expect((await read('/api/novels/org-novel', ORG_MEMBER, ORG_ID)).statusCode).toBe(200);
      expect((await read('/api/novels/org-novel', OUTSIDER, '9999')).statusCode).toBe(404);
      expect((await read('/api/novels/org-novel')).statusCode).toBe(404);
    });
  });

  describe('the reader surface', () => {
    const authed = async (method: 'get' | 'post' | 'put', path: string, sub: string, body?: object) => {
      const bearer = await userToken(sub);
      const request = env.getRouter().mockRequest();
      const chain = request[method](path).headers({ authorization: `Bearer ${bearer}` });
      return body ? chain.body(body) : chain;
    };

    it('should refuse to shelve a novel the reader may not read', async () => {
      await seed('shelf-private', 'RESTRICTED', { subjectIds: [GRANTEE] });
      expect((await authed('post', '/api/library', OUTSIDER, { slug: 'shelf-private' })).statusCode).toBe(404);
      expect((await authed('post', '/api/library', GRANTEE, { slug: 'shelf-private' })).statusCode).toBe(204);
    });

    it('should list a shared novel on the shared shelf and nowhere else', async () => {
      await seed('shared-shelf', 'RESTRICTED', { subjectIds: [GRANTEE] });

      const mine = ((await authed('get', '/api/shared', GRANTEE)).json() as { items: { slug: string }[] }).items;
      expect(mine.map(item => item.slug)).toContain('shared-shelf');
      expect(mine.find(item => item.slug === 'shared-shelf')).toMatchObject({ visibility: 'RESTRICTED' });

      const theirs = ((await authed('get', '/api/shared', OUTSIDER)).json() as { items: unknown[] }).items;
      expect(theirs).toHaveLength(0);
    });

    it('should drop a novel out of the shelf and the shared list the moment its grant is revoked', async () => {
      await seed('revoked-novel', 'RESTRICTED', { subjectIds: [GRANTEE] });
      expect((await authed('post', '/api/library', GRANTEE, { slug: 'revoked-novel' })).statusCode).toBe(204);
      expect(((await authed('get', '/api/library', GRANTEE)).json() as { items: unknown[] }).items).toHaveLength(1);

      expect((await push('put', '/internal/novels/revoked-novel/access', { visibility: 'RESTRICTED', subjectIds: [], revision: 2 })).statusCode).toBe(200);

      expect(((await authed('get', '/api/library', GRANTEE)).json() as { items: unknown[] }).items).toHaveLength(0);
      expect(((await authed('get', '/api/shared', GRANTEE)).json() as { items: unknown[] }).items).toHaveLength(0);
      expect((await read('/api/novels/revoked-novel', GRANTEE)).statusCode).toBe(404);
    });

    it('should keep reading progress out of the history once access is gone', async () => {
      await seed('progress-novel', 'RESTRICTED', { subjectIds: [GRANTEE] });
      const saved = await authed('put', '/api/novels/progress-novel/progress', GRANTEE, { ordinal: 1, position: 0.5 });
      expect(saved.statusCode).toBe(200);
      expect(((await authed('get', '/api/me/progress', GRANTEE)).json() as { items: unknown[] }).items).toHaveLength(1);

      expect((await push('put', '/internal/novels/progress-novel/access', { visibility: 'RESTRICTED', subjectIds: [], revision: 2 })).statusCode).toBe(200);
      expect(((await authed('get', '/api/me/progress', GRANTEE)).json() as { items: unknown[] }).items).toHaveLength(0);
    });

    it('should serve the shared shelf uncacheable', async () => {
      const response = await authed('get', '/api/shared', GRANTEE);
      expect(response.headers['cache-control']).toBe('private, no-store');
    });
  });
});
