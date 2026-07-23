/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { schema } from '@server/database';
import { TestEnvironment } from '@tests/test-environment';
import { issueTestToken } from '@tests/test-idp';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Regression coverage for the object-level authorization findings (NF-BOLA-01/02). Alice and Bob are
 * two distinct identity users; the guard must keep Bob out of everything Alice owns while never blocking
 * Alice from her own project. Every test seeds its own projects because `TestEnvironment` recreates the
 * database from the template before each test.
 */

const ALICE = '1001';
const BOB = '2002';

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

const aliceToken = await issueTestToken({ sub: ALICE });
const bobToken = await issueTestToken({ sub: BOB });

const testEnv = new TestEnvironment('ownership_test');

describe.if(pgAvailable)('Project ownership (BOLA)', () => {
  testEnv.init();

  const asUser = (token: string) =>
    testEnv
      .getRouter({ authenticated: false })
      .mockRequest()
      .headers({ authorization: `Bearer ${token}` });
  const asAlice = () => asUser(aliceToken);
  const asBob = () => asUser(bobToken);

  const createProjectAs = async (token: string, name: string): Promise<string> => {
    const response = await asUser(token).post('/api/v1/projects').body({ name, kind: 'new_novel' });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  };

  describe('POST /api/v1/projects', () => {
    it('should stamp the creating user as the project owner', async () => {
      const id = await createProjectAs(aliceToken, 'alice-owned');
      const row = await testEnv.getPostgresClient().query.projects.findFirst({ where: eq(schema.projects.id, BigInt(id)) });
      expect(row?.ownerId).toBe(BigInt(ALICE));
    });
  });

  describe('GET /api/v1/projects', () => {
    it("should return only the caller's own projects", async () => {
      const aliceId = await createProjectAs(aliceToken, 'alice-list');
      const bobId = await createProjectAs(bobToken, 'bob-list');

      const list = await asBob().get('/api/v1/projects');
      expect(list.statusCode).toBe(200);
      const ids = (list.json().items as { id: string }[]).map(item => item.id);
      expect(ids).toContain(bobId);
      expect(ids).not.toContain(aliceId);
    });
  });

  describe('project-scoped routes as a non-owner', () => {
    it("should answer 404 for GET/PATCH/DELETE on another user's project", async () => {
      const aliceId = await createProjectAs(aliceToken, 'alice-crud');

      const get = await asBob().get(`/api/v1/projects/${aliceId}`);
      expect(get.statusCode).toBe(404);

      const patch = await asBob().patch(`/api/v1/projects/${aliceId}`).body({ title: 'hijacked' });
      expect(patch.statusCode).toBe(404);

      const del = await asBob().delete(`/api/v1/projects/${aliceId}`);
      expect(del.statusCode).toBe(404);
    });

    it("should answer 404 for a nested route on another user's project", async () => {
      const aliceId = await createProjectAs(aliceToken, 'alice-nested');
      const nested = await asBob().get(`/api/v1/projects/${aliceId}/entities`);
      expect(nested.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/jobs/:jobId', () => {
    it("should answer 404 when the job belongs to another user's project", async () => {
      const aliceId = await createProjectAs(aliceToken, 'alice-job');
      const [job] = await testEnv
        .getPostgresClient()
        .insert(schema.jobs)
        .values({ projectId: BigInt(aliceId), kind: 'generate', target: '1' })
        .returning({ id: schema.jobs.id });
      const jobId = job?.id as string;

      const asBobView = await asBob().get(`/api/v1/jobs/${jobId}`);
      expect(asBobView.statusCode).toBe(404);

      const asAliceView = await asAlice().get(`/api/v1/jobs/${jobId}`);
      expect(asAliceView.statusCode).toBe(200);
      expect(asAliceView.json().id).toBe(jobId);
    });
  });

  describe('owner positive control', () => {
    it('should let the owner read her own project and its nested routes', async () => {
      const aliceId = await createProjectAs(aliceToken, 'alice-self');

      const get = await asAlice().get(`/api/v1/projects/${aliceId}`);
      expect(get.statusCode).toBe(200);
      expect(get.json().id).toBe(aliceId);

      const nested = await asAlice().get(`/api/v1/projects/${aliceId}/entities`);
      expect(nested.statusCode).toBe(200);
    });
  });
});
