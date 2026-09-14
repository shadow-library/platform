import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { CURATE_PERMISSION, PROJECTS_READ_PERMISSION } from '@server/constants';
import { schema } from '@server/database';
import { AUTH_AUDIENCE, issueTestBotKey, testIdP } from '@tests/test-idp';
import { TestEnvironment } from '@tests/test-environment';

/**
 * The actor-aware ownership model. Ownership is the `(owner_kind, owner_id)` pair, so a bot and a user
 * sharing a numeric id are different owners; on top of that a project its owner shared with the
 * organisation is reachable by a member of that organisation holding `novel-forge:curate`.
 */

const ORG = '7001';
const OTHER_ORG = '8001';
/** Deliberately the curator's own numeric id: the bot must still be a different owner. */
const BOT_ID = '3001';
const CURATOR = '3001';
const MEMBER = '3002';
const OUTSIDER = '3003';
const OTHER_BOT_ID = '3005';

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge');
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

testIdP.grantPermission({ kind: 'user', sub: CURATOR }, ORG, CURATE_PERMISSION);
testIdP.grantPermission({ kind: 'user', sub: OUTSIDER }, OTHER_ORG, CURATE_PERMISSION);

const NO_ORG_USER = '3004';

const curatorToken = await testIdP.issueToken({ sub: CURATOR, audience: AUTH_AUDIENCE, org: ORG });
const memberToken = await testIdP.issueToken({ sub: MEMBER, audience: AUTH_AUDIENCE, org: ORG });
const outsiderToken = await testIdP.issueToken({ sub: OUTSIDER, audience: AUTH_AUDIENCE, org: OTHER_ORG });
const noOrgToken = await testIdP.issueToken({ sub: NO_ORG_USER, audience: AUTH_AUDIENCE });

const testEnv = new TestEnvironment('org_sharing');

describe.if(pgAvailable)('Organisation-shared project access', () => {
  testEnv.init();

  const asUser = (token: string) =>
    testEnv
      .getRouter({ authenticated: false })
      .mockRequest()
      .headers({ authorization: `Bearer ${token}` });

  const seedBotProject = async (name: string, sharedWithOrg: boolean, organisationId = ORG): Promise<string> => {
    const [project] = await testEnv
      .getPostgresClient()
      .insert(schema.projects)
      .values({ name, kind: 'new_novel', ownerKind: 'bot', ownerId: BigInt(BOT_ID), organisationId: BigInt(organisationId), sharedWithOrg })
      .returning({ id: schema.projects.id });
    return (project?.id as bigint).toString();
  };

  it('should keep a bot-owned project away from the user holding the same numeric id', async () => {
    const projectId = await seedBotProject('bot-private', false);

    const read = await asUser(curatorToken).get(`/api/v1/projects/${projectId}`);
    const list = await asUser(curatorToken).get('/api/v1/projects');

    expect(read.statusCode).toBe(404);
    expect((list.json().items as { id: string }[]).map(item => item.id)).not.toContain(projectId);
  });

  it('should let an organisation curator open a project its bot owner shared', async () => {
    const projectId = await seedBotProject('bot-shared', true);

    const read = await asUser(curatorToken).get(`/api/v1/projects/${projectId}`);
    const nested = await asUser(curatorToken).get(`/api/v1/projects/${projectId}/entities`);

    expect(read.statusCode).toBe(200);
    expect(nested.statusCode).toBe(200);
  });

  it('should answer 404 to an organisation member who does not hold the curate permission', async () => {
    const projectId = await seedBotProject('bot-shared-member', true);

    const read = await asUser(memberToken).get(`/api/v1/projects/${projectId}`);

    expect(read.statusCode).toBe(404);
  });

  it('should answer 404 to a curator of a different organisation', async () => {
    const projectId = await seedBotProject('bot-shared-other-org', true);

    const read = await asUser(outsiderToken).get(`/api/v1/projects/${projectId}`);

    expect(read.statusCode).toBe(404);
  });

  it('should leave a project its owner never shared closed to every curator', async () => {
    const projectId = await seedBotProject('bot-unshared', false);

    const read = await asUser(curatorToken).get(`/api/v1/projects/${projectId}`);

    expect(read.statusCode).toBe(404);
  });

  it('should refuse a bot-owned project that names no organisation, while accepting the same row with one', async () => {
    const orphan = testEnv
      .getPostgresClient()
      .insert(schema.projects)
      .values({ name: 'bot-orphan', kind: 'new_novel', ownerKind: 'bot', ownerId: BigInt(BOT_ID) })
      .execute();
    await expect(orphan).rejects.toThrow();

    await expect(seedBotProject('bot-scoped', false)).resolves.toBeDefined();
  });

  it('should stamp a user creator as the owner, with no organisation and no sharing', async () => {
    const created = await asUser(curatorToken).post('/api/v1/projects').body({ name: 'curator-own', kind: 'new_novel' });
    expect(created.statusCode).toBe(201);

    const row = await testEnv.getPostgresClient().query.projects.findFirst({ where: eq(schema.projects.id, BigInt(created.json().id as string)) });

    expect(row?.ownerKind).toBe('user');
    expect(row?.ownerId).toBe(BigInt(CURATOR));
    expect(row?.organisationId).toBeNull();
    expect(row?.sharedWithOrg).toBe(false);
  });

  describe('GET /api/v1/projects (list)', () => {
    it("should widen a curator's listing to include a project its bot owner shared, alongside their own", async () => {
      const shared = await seedBotProject('list-bot-shared', true);
      const own = (await asUser(curatorToken).post('/api/v1/projects').body({ name: 'list-curator-own', kind: 'new_novel' })).json().id as string;

      const list = await asUser(curatorToken).get('/api/v1/projects?limit=100');

      const ids = (list.json().items as { id: string }[]).map(item => item.id);
      expect(ids).toContain(shared);
      expect(ids).toContain(own);
    });

    it('should serialize ownerKind and sharedWithOrg on a listed project', async () => {
      const shared = await seedBotProject('list-fields', true);

      const list = await asUser(curatorToken).get('/api/v1/projects?limit=100');

      const item = (list.json().items as { id: string; ownerKind: string; sharedWithOrg: boolean }[]).find(row => row.id === shared);
      expect(item).toMatchObject({ ownerKind: 'bot', sharedWithOrg: true });
    });

    it('should keep the shared project off the listing of an organisation member without the curate permission', async () => {
      const shared = await seedBotProject('list-member-blind', true);

      const list = await asUser(memberToken).get('/api/v1/projects?limit=100');

      expect((list.json().items as { id: string }[]).map(item => item.id)).not.toContain(shared);
    });

    it("should keep the shared project off a different organisation's curator listing", async () => {
      const shared = await seedBotProject('list-outsider-blind', true);

      const list = await asUser(outsiderToken).get('/api/v1/projects?limit=100');

      expect((list.json().items as { id: string }[]).map(item => item.id)).not.toContain(shared);
    });

    it('should leave an unshared bot project out of the curator listing', async () => {
      const unshared = await seedBotProject('list-unshared', false);

      const list = await asUser(curatorToken).get('/api/v1/projects?limit=100');

      expect((list.json().items as { id: string }[]).map(item => item.id)).not.toContain(unshared);
    });

    it("should leave a user with no organisation's own listing unaffected by sharing", async () => {
      await seedBotProject('list-noorg-shared', true);
      const own = (await asUser(noOrgToken).post('/api/v1/projects').body({ name: 'list-noorg-own', kind: 'new_novel' })).json().id as string;

      const list = await asUser(noOrgToken).get('/api/v1/projects?limit=100');

      expect((list.json().items as { id: string }[]).map(item => item.id)).toEqual([own]);
    });

    it('should keep total and pagination in agreement with the widened set', async () => {
      const shared = await seedBotProject('list-page-shared', true);
      const own = (await asUser(curatorToken).post('/api/v1/projects').body({ name: 'list-page-own', kind: 'new_novel' })).json().id as string;

      const full = await asUser(curatorToken).get('/api/v1/projects?limit=100');
      const total = full.json().total as number;
      const allIds = (full.json().items as { id: string }[]).map(item => item.id);
      expect(allIds).toContain(shared);
      expect(allIds).toContain(own);
      // Proves $count's where actually matches findMany's — not just that a page echoes its own total.
      expect(total).toBe(allIds.length);

      const firstPage = await asUser(curatorToken).get('/api/v1/projects?limit=1&offset=0');
      const secondPage = await asUser(curatorToken).get('/api/v1/projects?limit=1&offset=1');

      expect(firstPage.json().total).toBe(total);
      expect(secondPage.json().total).toBe(total);
      expect(firstPage.json().items).toHaveLength(1);
      expect(secondPage.json().items).toHaveLength(1);
      expect((firstPage.json().items as { id: string }[])[0]?.id).not.toBe((secondPage.json().items as { id: string }[])[0]?.id);
    });

    it("should never show a bot caller another owner's shared project in its own listing", async () => {
      const shared = await seedBotProject('list-bot-caller-blind', true);
      const otherBotKey = issueTestBotKey(OTHER_BOT_ID, [PROJECTS_READ_PERMISSION], ORG);

      const list = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .headers({ authorization: `Bearer ${otherBotKey}` })
        .get('/api/v1/projects?limit=100');

      expect(list.statusCode).toBe(200);
      expect((list.json().items as { id: string }[]).map(item => item.id)).not.toContain(shared);
    });
  });
});
