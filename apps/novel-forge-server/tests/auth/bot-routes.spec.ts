import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { type Chain as MockRequest } from 'light-my-request';

import { CURATE_PERMISSION, GENERATION_RUN_PERMISSION, ILLUSTRATIONS_WRITE_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';
import { type Illustration, schema } from '@server/database';
import { TestEnvironment } from '@tests/test-environment';
import { AUTH_AUDIENCE, issueTestBotKey, TEST_BOT_ORG, TEST_USER, testIdP } from '@tests/test-idp';

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

const BOTS_MANAGE = 'novel-forge:bots:manage';
const EVERY_PERMISSION = [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION, ILLUSTRATIONS_WRITE_PERMISSION, GENERATION_RUN_PERMISSION, CURATE_PERMISSION];
const PDP_PATH = '/api/v1/authz/check';

/** Identity is the only caller admitted to `/internal/bots/*`; the rule has to be in place before the SDK loads it at boot */
testIdP.setServiceAccess([{ callerClientId: 'identity-server', method: '*', path: '/internal/bots/*' }]);

const keys = {
  reader: issueTestBotKey('101', [PROJECTS_READ_PERMISSION]),
  writer: issueTestBotKey('102', [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION]),
  rival: issueTestBotKey('103', [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION]),
  illustrator: issueTestBotKey('104', [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION, ILLUSTRATIONS_WRITE_PERMISSION]),
  generator: issueTestBotKey('105', [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION, GENERATION_RUN_PERMISSION]),
  everything: issueTestBotKey('106', EVERY_PERMISSION),
  generateOnly: issueTestBotKey('107', [PROJECTS_READ_PERMISSION, GENERATION_RUN_PERMISSION]),
  internalOwner: issueTestBotKey('201', [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION]),
  internalOther: issueTestBotKey('202', [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION]),
};

const testEnv = new TestEnvironment('bot_routes_test');

describe.if(pgAvailable)('bots on the novel forge API', () => {
  testEnv.init();

  const bot = (key: string): MockRequest =>
    testEnv
      .getRouter({ authenticated: false })
      .mockRequest()
      .headers({ authorization: `Bearer ${key}` });
  const human = (): MockRequest => testEnv.getRouter().mockRequest();

  async function createProject(key: string, name = 'bot-project'): Promise<string> {
    const response = await bot(key).post('/api/v1/projects').body({ name, kind: 'new_novel' });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  const reassign = (projectId: string, ownerId: bigint): Promise<unknown> =>
    testEnv
      .getPostgresClient()
      .update(schema.projects)
      .set({ ownerId })
      .where(eq(schema.projects.id, BigInt(projectId)));

  describe('projects:read', () => {
    it('should let a reader bot list and read what it owns', async () => {
      const projectId = await createProject(keys.writer);
      await reassign(projectId, 101n);

      expect((await bot(keys.reader).get('/api/v1/projects')).statusCode).toBe(200);
      const read = await bot(keys.reader).get(`/api/v1/projects/${projectId}`);
      expect(read.statusCode).toBe(200);
      expect(read.json().id).toBe(projectId);
    });

    it('should refuse a reader bot every write route', async () => {
      const create = await bot(keys.reader).post('/api/v1/projects').body({ name: 'nope', kind: 'new_novel' });
      expect(create.statusCode).toBe(403);
      expect(create.json().code).toBe('IAM_002');

      const projectId = await createProject(keys.writer);
      await reassign(projectId, 101n);
      expect((await bot(keys.reader).patch(`/api/v1/projects/${projectId}`).body({ title: 'renamed' })).statusCode).toBe(403);
      expect((await bot(keys.reader).delete(`/api/v1/projects/${projectId}`)).statusCode).toBe(403);
      expect((await bot(keys.reader).put(`/api/v1/projects/${projectId}/bible/project/premise`).body({ content: 'x' })).statusCode).toBe(403);
    });
  });

  describe('projects:write', () => {
    it('should let a writer bot create and edit its own project', async () => {
      const projectId = await createProject(keys.writer, 'writable');
      const retitled = await bot(keys.writer).patch(`/api/v1/projects/${projectId}`).body({ title: 'A Bot Wrote This' });
      expect(retitled.statusCode).toBe(200);
      expect(retitled.json().title).toBe('A Bot Wrote This');
    });

    /** Shared on creation, not later: nothing can hand a record to a bot, and the sharing branch is user-only, so an unshared bot project would be reachable by no person at all. */
    it('should own what it creates on behalf of its organisation, and share it with that organisation', async () => {
      const projectId = await createProject(keys.writer, 'owned');
      const project = await testEnv.getPostgresClient().query.projects.findFirst({ where: eq(schema.projects.id, BigInt(projectId)) });
      expect(project).toMatchObject({ ownerKind: 'bot', ownerId: 102n, organisationId: BigInt(TEST_BOT_ORG), sharedWithOrg: true });
    });
  });

  describe('generation:run', () => {
    it('should refuse a generation route to a bot that writes but cannot generate', async () => {
      const projectId = await createProject(keys.writer, 'no-generation');
      const response = await bot(keys.writer)
        .post(`/api/v1/projects/${projectId}/generate`)
        .body({ chapters: [1] });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('IAM_002');
    });

    /** `stress` locks the seed and updates its readiness, so generation alone must not reach it — an admin downgrading Writer to Reader has to stop the writing too. */
    it('should refuse a bot that generates but cannot write on a generation route that also persists', async () => {
      const projectId = await createProject(keys.writer, 'stress-without-write');
      await reassign(projectId, 107n);
      const response = await bot(keys.generateOnly).post(`/api/v1/projects/${projectId}/seed/stress`).body({});
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('IAM_002');
    });

    it('should refuse a generation route to a bot that generates but cannot write', async () => {
      const projectId = await createProject(keys.writer, 'read-only-generator');
      await reassign(projectId, 107n);
      expect(
        (
          await bot(keys.generateOnly)
            .post(`/api/v1/projects/${projectId}/generate`)
            .body({ chapters: [1] })
        ).statusCode,
      ).toBe(403);
    });

    it('should admit a bot holding both past the guard', async () => {
      const projectId = await createProject(keys.generator, 'generates');
      const response = await bot(keys.generator).post(`/api/v1/projects/${projectId}/chapters/1/summarize`).body({});
      expect(response.statusCode).not.toBe(401);
      expect(response.statusCode).not.toBe(403);
    });
  });

  describe('illustrations:write', () => {
    it('should refuse an illustration route to a bot that only writes projects', async () => {
      const projectId = await createProject(keys.writer, 'no-illustrations');
      expect((await bot(keys.writer).delete(`/api/v1/projects/${projectId}/cover`)).statusCode).toBe(403);
    });

    it('should admit a bot holding the illustrations grant', async () => {
      const projectId = await createProject(keys.illustrator, 'illustrated');
      expect((await bot(keys.illustrator).delete(`/api/v1/projects/${projectId}/cover`)).statusCode).toBe(200);
    });
  });

  describe('routes that declare no bot permission', () => {
    it('should refuse the account and credential surface to a bot holding every permission', async () => {
      expect((await bot(keys.everything).get('/api/v1/ai/settings')).statusCode).toBe(403);
      expect((await bot(keys.everything).put('/api/v1/ai/settings').body({})).statusCode).toBe(403);
      expect((await bot(keys.everything).get('/api/v1/ai/models')).statusCode).toBe(403);
    });

    it('should refuse the publishing surface, which acts for a human organisation member', async () => {
      const projectId = await createProject(keys.everything, 'unpublishable');
      expect((await bot(keys.everything).get(`/api/v1/projects/${projectId}/publications`)).statusCode).toBe(403);
      expect((await bot(keys.everything).post(`/api/v1/projects/${projectId}/publish`).body({})).statusCode).toBe(403);
      expect((await bot(keys.everything).get(`/api/v1/projects/${projectId}/publications/access`)).statusCode).toBe(403);
    });

    it('should refuse the deprecated entity illustration surface', async () => {
      const projectId = await createProject(keys.everything, 'legacy');
      expect((await bot(keys.everything).post(`/api/v1/projects/${projectId}/entities/hero/illustration`).body({})).statusCode).toBe(403);
    });
  });

  describe('curated ingest', () => {
    it('should gate the ingest surface on the curate permission alone', async () => {
      expect((await bot(keys.writer).get('/api/v1/ingest/novels/some-ref/manifest')).statusCode).toBe(403);
      // Past the guard: `ING_001`, because no novel was ever pushed at that reference.
      expect((await bot(keys.everything).get('/api/v1/ingest/novels/some-ref/manifest')).statusCode).toBe(404);
    });
  });

  describe('cross-owner isolation', () => {
    it('should hide another bot of the same organisation', async () => {
      const projectId = await createProject(keys.writer, 'mine');
      const response = await bot(keys.rival).get(`/api/v1/projects/${projectId}`);
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('PRJ_001');
    });

    it("should hide a user's project from a bot", async () => {
      const created = await human().post('/api/v1/projects').body({ name: 'human', kind: 'new_novel' });
      expect(created.statusCode).toBe(201);
      expect((await bot(keys.writer).get(`/api/v1/projects/${created.json().id}`)).statusCode).toBe(404);
    });

    it('should hide a bot project from a user of the same organisation', async () => {
      const projectId = await createProject(keys.writer, 'bot-only');
      expect((await human().get(`/api/v1/projects/${projectId}`)).statusCode).toBe(404);
    });
  });

  describe('human requests', () => {
    it('should answer a human exactly as before, with no policy decision call', async () => {
      const before = testIdP.getRequestCount(PDP_PATH);
      const list = await human().get('/api/v1/projects');
      const created = await human().post('/api/v1/projects').body({ name: 'human-path', kind: 'new_novel' });
      const read = await human().get(`/api/v1/projects/${created.json().id}`);

      expect([list.statusCode, created.statusCode, read.statusCode]).toEqual([200, 201, 200]);
      expect(testIdP.getRequestCount(PDP_PATH)).toBe(before);
    });
  });

  describe('internal bot ownership endpoints', () => {
    const identityToken = (scopes: string[] = [BOTS_MANAGE]): Promise<string> =>
      testIdP.issueToken({ sub: 'identity-server', kind: 'service', clientId: 'identity-server', audience: AUTH_AUDIENCE, scopes });
    const identity = (token: string): MockRequest =>
      testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .headers({ authorization: `Bearer ${token}` });

    async function seedOwnership(key: string, ownerId: bigint): Promise<bigint> {
      const projectId = BigInt(await createProject(key, `owned-by-${ownerId}`));
      await testEnv
        .getPostgresClient()
        .insert(schema.illustrations)
        .values({ projectId, subjectType: 'cover', promptSpec: {} as Illustration.PromptSpec, candidates: [], ownerKind: 'bot', ownerId });
      return projectId;
    }

    it('should count what one bot owns and nothing else', async () => {
      await seedOwnership(keys.internalOwner, 201n);
      await seedOwnership(keys.internalOther, 202n);

      const response = await identity(await identityToken()).get('/internal/bots/201/ownership');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projects: 1, illustrations: 1 });
    });

    it('should report zeros for a bot this service has never seen', async () => {
      const response = await identity(await identityToken()).get('/internal/bots/999/ownership');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projects: 0, illustrations: 0 });
    });

    it('should refuse a caller without the scope, a user, and a bot', async () => {
      expect((await identity(await identityToken([])).get('/internal/bots/201/ownership')).statusCode).toBe(403);
      expect((await human().get('/internal/bots/201/ownership')).statusCode).toBe(403);
      expect((await bot(keys.everything).get('/internal/bots/201/ownership')).statusCode).toBe(403);
      expect(
        (
          await identity(await identityToken([]))
            .post('/internal/bots/201/transfer')
            .body({ toUserId: TEST_USER.userId })
        ).statusCode,
      ).toBe(403);
      expect((await human().post('/internal/bots/201/transfer').body({ toUserId: TEST_USER.userId })).statusCode).toBe(403);
    });

    it('should reassign the bot rows to the user, keep the organisation sharing, and leave other owners alone', async () => {
      const mine = await seedOwnership(keys.internalOwner, 201n);
      await seedOwnership(keys.internalOther, 202n);
      await testEnv.getPostgresClient().update(schema.projects).set({ sharedWithOrg: true }).where(eq(schema.projects.id, mine));

      const response = await identity(await identityToken())
        .post('/internal/bots/201/transfer')
        .body({ toUserId: TEST_USER.userId });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ projects: 1, illustrations: 1 });

      const db = testEnv.getPostgresClient();
      const transferred = await db.query.projects.findFirst({ where: eq(schema.projects.id, mine) });
      expect(transferred).toMatchObject({ ownerKind: 'user', ownerId: BigInt(TEST_USER.userId), organisationId: BigInt(TEST_BOT_ORG), sharedWithOrg: true });

      const strays = await db
        .select()
        .from(schema.illustrations)
        .where(and(eq(schema.illustrations.ownerKind, 'bot'), eq(schema.illustrations.ownerId, 202n)));
      expect(strays).toHaveLength(1);
      expect((await identity(await identityToken()).get('/internal/bots/202/ownership')).json()).toEqual({ projects: 1, illustrations: 1 });
    });

    it('should be safe to retry', async () => {
      await seedOwnership(keys.internalOwner, 201n);
      const first = await identity(await identityToken())
        .post('/internal/bots/201/transfer')
        .body({ toUserId: TEST_USER.userId });
      const second = await identity(await identityToken())
        .post('/internal/bots/201/transfer')
        .body({ toUserId: TEST_USER.userId });

      expect(first.json()).toEqual({ projects: 1, illustrations: 1 });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual({ projects: 0, illustrations: 0 });
      expect((await identity(await identityToken()).get('/internal/bots/201/ownership')).json()).toEqual({ projects: 0, illustrations: 0 });
    });

    it('should reject a malformed bot id or target user', async () => {
      const badBot = await identity(await identityToken())
        .post('/internal/bots/not-a-number/transfer')
        .body({ toUserId: TEST_USER.userId });
      const badUser = await identity(await identityToken())
        .post('/internal/bots/201/transfer')
        .body({ toUserId: 'nobody' });
      expect(badBot.statusCode).toBeGreaterThanOrEqual(400);
      expect(badBot.statusCode).toBeLessThan(500);
      expect(badUser.statusCode).toBeGreaterThanOrEqual(400);
      expect(badUser.statusCode).toBeLessThan(500);
    });
  });
});
