import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

import { JobExecutor } from '@modules/jobs/job.executor';
import * as schema from '@server/database/schemas';
import { TEST_REGEX, TestEnvironment } from '@tests/test-environment';

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

const testEnv = new TestEnvironment('reforge_api');

describe.if(pgAvailable)('Reforge API', () => {
  testEnv.init();

  async function createProject(kind: 'source' | 'new_novel' = 'source'): Promise<string> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `reforge-api-${Math.random()}`, kind });
    return response.json().id as string;
  }

  describe('PUT /api/v1/projects/:projectId/reforge/config', () => {
    it('should create the reforge on first write and round-trip config into status', async () => {
      const projectId = await createProject();
      const put = await testEnv
        .getRouter()
        .mockRequest()
        .put(`/api/v1/projects/${projectId}/reforge/config`)
        .body({ instructions: 'cut the filler tournament arc; raise the prose', fidelity: 'close', settings: { judgeEnabled: false, targetWords: 3000 } });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toMatchObject({
        status: 'pending',
        instructions: 'cut the filler tournament arc; raise the prose',
        fidelity: 'close',
        settings: { judgeEnabled: false, targetWords: 3000 },
      });

      const status = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge`);
      expect(status.statusCode).toBe(200);
      expect(status.json()).toMatchObject({
        reforge: { instructions: 'cut the filler tournament arc; raise the prose', fidelity: 'close' },
        sourceChapters: 0,
        glossaryCount: 0,
        counts: { reforged: 0, attention: 0, failed: 0 },
      });
    });

    it('should reject non-source projects', async () => {
      const projectId = await createProject('new_novel');
      const response = await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/reforge/config`).body({ instructions: 'x' });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('REF_003');
    });
  });

  describe('POST /api/v1/projects/:projectId/reforge', () => {
    it('should enqueue the reforge job and return 202', async () => {
      const projectId = await createProject();
      // The endpoint fire-and-forgets a dispatch; stub it so the test never runs a real pipeline.
      const executor = testEnv.getService(JobExecutor);
      (executor as { dispatch: (jobId: string) => Promise<void> }).dispatch = async () => undefined;

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/reforge`).body({ limit: 3 });
      expect(response.statusCode).toBe(202);
      const body = response.json();
      expect(body.jobId).toMatch(TEST_REGEX.uuid);
      expect(body).toMatchObject({ kind: 'reforge', status: 'pending', target: `reforge-${projectId}` });

      const rerun = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/reforge/chapters/7`).body({});
      expect(rerun.statusCode).toBe(202);
      expect(rerun.json().target).toBe(`reforge-${projectId}-ch-7`);
    });
  });

  describe('GET /api/v1/projects/:projectId/reforge/chapters/:chapter', () => {
    it('should return the reforged chapter and 404 unknown chapters with REF_002', async () => {
      const projectId = await createProject();
      await testEnv
        .getPostgresClient()
        .insert(schema.chapterReforges)
        .values({ projectId: BigInt(projectId), chapter: 1, title: 'Awakening', body: 'Evan Vale rose in the vale.', status: 'reforged', wordCount: 5 });

      const found = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/chapters/1`);
      expect(found.statusCode).toBe(200);
      expect(found.json()).toMatchObject({ chapter: 1, title: 'Awakening', body: 'Evan Vale rose in the vale.', status: 'reforged', wordCount: 5, revision: 1 });

      const missing = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/chapters/99`);
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe('REF_002');
    });
  });

  describe('GET /api/v1/projects/:projectId/reforge/chapters + /manuscript', () => {
    it('should list reforge summaries and join the reforged manuscript, skipping failed rows', async () => {
      const projectId = await createProject();
      const db = testEnv.getPostgresClient();
      await db.insert(schema.chapterReforges).values([
        { projectId: BigInt(projectId), chapter: 1, title: 'Awakening', body: 'Evan Vale rose.', status: 'reforged', wordCount: 3 },
        { projectId: BigInt(projectId), chapter: 2, body: '', status: 'failed' },
      ]);

      const list = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/chapters`);
      expect(list.statusCode).toBe(200);
      expect(list.json().items).toMatchObject([
        { chapter: 1, title: 'Awakening', status: 'reforged', issueCount: 0, wordCount: 3, revision: 1 },
        { chapter: 2, status: 'failed', issueCount: 0 },
      ]);

      const manuscript = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/manuscript`);
      expect(manuscript.statusCode).toBe(200);
      expect(manuscript.json().failedChapters).toEqual([2]);
      expect(manuscript.json().markdown).toContain('<!-- WARNING: chapter(s) 2 failed reforging');
      expect(manuscript.json().markdown).toContain('# Awakening\n\nEvan Vale rose.');
    });
  });
});
