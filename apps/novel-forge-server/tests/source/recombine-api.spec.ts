/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import * as schema from '@server/database/schemas';
import { TestEnvironment } from '@tests/test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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

const testEnv = new TestEnvironment('recombine_api');

describe.if(pgAvailable)('Recombine API', () => {
  testEnv.init();

  async function seedProject(): Promise<string> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `recombine-api-${Math.random()}`, kind: 'source' });
    const projectId = response.json().id as string;
    await testEnv
      .getPostgresClient()
      .insert(schema.chapters)
      .values([
        { projectId: BigInt(projectId), number: 1, title: 'The Gate (1/2)', content: 'Part one.', status: 'done' },
        { projectId: BigInt(projectId), number: 2, title: 'The Gate (2/2)', content: 'Part two.', status: 'done' },
        { projectId: BigInt(projectId), number: 3, title: 'The Road', content: 'Onward.', status: 'done' },
      ]);
    return projectId;
  }

  describe('POST /api/v1/projects/:projectId/recombine', () => {
    it('should return the plan without writing on dryRun and apply on a plain call', async () => {
      const projectId = await seedProject();

      const dryRun = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/recombine`).body({ dryRun: true });
      expect(dryRun.statusCode).toBe(200);
      expect(dryRun.json()).toMatchObject({ applied: false, before: 3, after: 2, merged: [{ number: 1, title: 'The Gate', parts: 2 }] });

      const apply = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/recombine`).body({});
      expect(apply.statusCode).toBe(200);
      expect(apply.json()).toMatchObject({ applied: true, before: 3, after: 2 });

      const chapters = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/source/chapters`);
      expect(chapters.json().items).toHaveLength(2);
    });

    it('should reject recombine before any chapters exist with SRC_002', async () => {
      const response = await testEnv
        .getRouter()
        .mockRequest()
        .post('/api/v1/projects')
        .body({ name: `recombine-api-empty-${Math.random()}`, kind: 'source' });
      const projectId = response.json().id as string;

      const recombine = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/recombine`).body({});
      expect(recombine.statusCode).toBe(400);
      expect(recombine.json().code).toBe('SRC_002');
    });

    it('should surface the derived-data guard as SRC_003', async () => {
      const projectId = await seedProject();
      await testEnv
        .getPostgresClient()
        .insert(schema.briefs)
        .values({ projectId: BigInt(projectId), chapter: 1, body: 'brief' });

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/recombine`).body({});
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('SRC_003');
    });
  });
});
