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
import { WebnovelCatalogService } from '@modules/source';
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
      .body({ name: `recombine-api-${Math.random()}`, kind: 'source', url: 'https://example.com/novel' });
    const projectId = response.json().id as string;
    await testEnv
      .getPostgresClient()
      .update(schema.projects)
      .set({ scrapeComplete: true })
      .where(eq(schema.projects.id, BigInt(projectId)));
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

    it('should fetch the reference catalog and retitle via POST /retitle', async () => {
      const projectId = await seedProject();
      await testEnv
        .getPostgresClient()
        .update(schema.projects)
        .set({ webnovelId: 'wn-42' })
        .where(eq(schema.projects.id, BigInt(projectId)));
      // Stub the network fetch on the app's singleton so the test never touches third-party-site.example.
      const catalog = testEnv.getService(WebnovelCatalogService);
      (catalog as { fetchCatalog: (bookId: string) => Promise<unknown> }).fetchCatalog = async () => [
        { index: 1, title: 'Chapter 1: The Gate (1/2)' },
        { index: 2, title: 'Chapter 1: The Gate (2/2)' },
        { index: 3, title: 'Chapter 2: The Road' },
      ];

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/retitle`).body({});
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ fetched: 3, retitled: 3, chapterCount: 3, referenceCount: 3 });

      const chapters = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/source/chapters`);
      expect(chapters.json().items.map((c: { title: string }) => c.title)).toEqual(['Chapter 1: The Gate (1/2)', 'Chapter 1: The Gate (2/2)', 'Chapter 2: The Road']);
    });

    it('should reject /retitle without a configured webnovel id', async () => {
      const projectId = await seedProject();
      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/retitle`).body({});
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('SRC_004');
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
