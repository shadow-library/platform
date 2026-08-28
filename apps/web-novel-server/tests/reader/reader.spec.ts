import { beforeAll, describe, expect, it } from 'bun:test';

import { schema } from '@server/modules/datastore';

import { csrfPair, TEST_REGEX, TestEnvironment } from '../test-environment';
import { FORGE_CLIENT_ID, idp, LOGIN_COOKIE_NAME, LOGIN_SCOPES, SESSION_COOKIE_NAME } from '../test-idp';

const env = new TestEnvironment('reader').init();

/**
 * The session is established once through the full OIDC dance against the mock IdP; the cookie is
 * stateless, so it stays valid across the per-test database resets.
 */
let sessionCookie = '';

const seedNovel = async (slug = 'moonfall') => {
  const db = env.getPostgresClient();
  const [novel] = await db
    .insert(schema.novels)
    .values({ slug, sourceClientId: FORGE_CLIENT_ID, title: 'Moonfall', coverPath: 'moonfall-cover.jpg', genres: ['Fantasy'], revision: 1 })
    .returning();
  return novel as { id: bigint };
};

const request = (method: 'get' | 'put' | 'post' | 'delete', path: string, cookie = sessionCookie) => {
  const csrf = csrfPair();
  const mock = env.getRouter().mockRequest();
  return mock[method](path)
    .headers({ 'x-csrf-token': csrf.header })
    .cookies({ [SESSION_COOKIE_NAME]: cookie, 'csrf-token': csrf.cookie });
};

beforeAll(async () => {
  const loginResponse = await env.getRouter().mockRequest().get('/api/auth/login');
  const location = new URL(loginResponse.headers.location as string);
  const loginCookie = loginResponse.cookies.find(cookie => cookie.name === LOGIN_COOKIE_NAME) as { value: string };
  const code = idp.createAuthorizationCode({ sub: 'reader-1', scopes: LOGIN_SCOPES });
  const callback = await env
    .getRouter()
    .mockRequest()
    .get(`/api/auth/callback?code=${code}&state=${location.searchParams.get('state')}`)
    .cookies({ [LOGIN_COOKIE_NAME]: loginCookie.value });
  sessionCookie = (callback.cookies.find(cookie => cookie.name === SESSION_COOKIE_NAME) as { value: string }).value;
});

describe('Reader progress and library', () => {
  describe('reading progress', () => {
    it('should round-trip progress for a session established via the identity provider', async () => {
      await seedNovel();
      const saved = await request('put', '/api/novels/moonfall/progress').body({ ordinal: 3, position: 0.42 });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ ordinal: 3, position: 0.42 });

      const fetched = await request('get', '/api/novels/moonfall/progress');
      expect(fetched.statusCode).toBe(200);
      expect(fetched.json()).toMatchObject({ ordinal: 3, position: 0.42 });
      expect((fetched.json() as { updatedAt: string }).updatedAt).toMatch(TEST_REGEX.dateISO);

      const updated = await request('put', '/api/novels/moonfall/progress').body({ ordinal: 4, position: 0 });
      expect(updated.statusCode).toBe(200);

      const list = await request('get', '/api/me/progress');
      expect(list.statusCode).toBe(200);
      expect((list.json() as { items: unknown[] }).items).toEqual([expect.objectContaining({ novelSlug: 'moonfall', ordinal: 4, position: 0 })]);
    });

    it('should initialize furthestOrdinal to the ordinal on the first save', async () => {
      await seedNovel('furthest-init');
      const saved = await request('put', '/api/novels/furthest-init/progress').body({ ordinal: 5, position: 0.1 });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ ordinal: 5, furthestOrdinal: 5 });
    });

    it('should keep furthestOrdinal at the furthest chapter reached when rereading an earlier one', async () => {
      await seedNovel('furthest-reread');
      const advanced = await request('put', '/api/novels/furthest-reread/progress').body({ ordinal: 40, position: 0 });
      expect(advanced.json()).toMatchObject({ ordinal: 40, furthestOrdinal: 40 });

      const reread = await request('put', '/api/novels/furthest-reread/progress').body({ ordinal: 3, position: 0 });
      expect(reread.statusCode).toBe(200);
      expect(reread.json()).toMatchObject({ ordinal: 3, furthestOrdinal: 40 });

      const fetched = await request('get', '/api/novels/furthest-reread/progress');
      expect(fetched.json()).toMatchObject({ ordinal: 3, furthestOrdinal: 40 });
    });

    it('should answer 404 when no progress is recorded yet', async () => {
      await seedNovel();
      const response = await request('get', '/api/novels/moonfall/progress');
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'WBN_006' });
    });

    it('should answer 404 when saving progress for an unknown novel', async () => {
      const response = await request('put', '/api/novels/unknown-novel/progress').body({ ordinal: 1, position: 0 });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'WBN_001' });
    });

    it('should require authentication', async () => {
      const response = await env.getRouter().mockRequest().get('/api/me/progress');
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'IAM_001' });
    });
  });

  describe('library', () => {
    it('should add, list, and remove novels idempotently', async () => {
      await seedNovel();
      const added = await request('post', '/api/library').body({ slug: 'moonfall' });
      expect(added.statusCode).toBe(204);

      const again = await request('post', '/api/library').body({ slug: 'moonfall' });
      expect(again.statusCode).toBe(204);

      const list = await request('get', '/api/library');
      expect(list.statusCode).toBe(200);
      const items = (list.json() as { items: { slug: string; addedAt: string }[] }).items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        slug: 'moonfall',
        title: 'Moonfall',
        coverUrl: 'http://localhost:9000/wiki-assets/moonfall-cover.jpg',
        genres: ['Fantasy'],
        status: 'live',
      });

      const removed = await request('delete', '/api/library/moonfall');
      expect(removed.statusCode).toBe(204);
      const removedAgain = await request('delete', '/api/library/moonfall');
      expect(removedAgain.statusCode).toBe(204);

      const emptied = await request('get', '/api/library');
      expect((emptied.json() as { items: unknown[] }).items).toHaveLength(0);
    });

    it('should answer 404 when adding an unknown novel', async () => {
      const response = await request('post', '/api/library').body({ slug: 'unknown-novel' });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'WBN_001' });
    });

    it('should scope the library to the session user', async () => {
      const novel = await seedNovel();
      await env.getPostgresClient().insert(schema.library).values({ userId: 'someone-else', novelId: novel.id });

      const list = await request('get', '/api/library');
      expect((list.json() as { items: unknown[] }).items).toHaveLength(0);
    });

    it('should require authentication', async () => {
      const response = await env.getRouter().mockRequest().get('/api/library');
      expect(response.statusCode).toBe(401);
    });
  });
});
