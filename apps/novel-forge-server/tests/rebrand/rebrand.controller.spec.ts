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

const testEnv = new TestEnvironment('rebrand_api');

describe.if(pgAvailable)('Rebrand API', () => {
  testEnv.init();

  async function createProject(kind: 'source' | 'new_novel' = 'source'): Promise<string> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `rebrand-api-${Math.random()}`, kind });
    return response.json().id as string;
  }

  describe('PUT /api/v1/projects/:projectId/rebrand/config', () => {
    it('should create the rebrand on first write and round-trip config into status', async () => {
      const projectId = await createProject();
      const put = await testEnv
        .getRouter()
        .mockRequest()
        .put(`/api/v1/projects/${projectId}/rebrand/config`)
        .body({ directives: 'weave romance into the story', settings: { auditEnabled: false, bannedExtra: ['Tang'] } });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toMatchObject({ status: 'pending', directives: 'weave romance into the story', settings: { auditEnabled: false, bannedExtra: ['Tang'] } });

      const status = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/rebrand`);
      expect(status.statusCode).toBe(200);
      expect(status.json()).toMatchObject({
        rebrand: { directives: 'weave romance into the story' },
        sourceChapters: 0,
        glossaryCount: 0,
        counts: { converted: 0, attention: 0, failed: 0 },
      });
    });

    it('should reject non-source projects', async () => {
      const projectId = await createProject('new_novel');
      const response = await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/rebrand/config`).body({ directives: 'x' });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('RBR_003');
    });
  });

  describe('POST /api/v1/projects/:projectId/rebrand', () => {
    it('should enqueue the rebrand job and return 202', async () => {
      const projectId = await createProject();
      // The endpoint fire-and-forgets a dispatch; stub it so the test never runs a real pipeline.
      const executor = testEnv.getService(JobExecutor);
      (executor as { dispatch: (jobId: string) => Promise<void> }).dispatch = async () => undefined;

      const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/rebrand`).body({ limit: 3 });
      expect(response.statusCode).toBe(202);
      const body = response.json();
      expect(body.jobId).toMatch(TEST_REGEX.uuid);
      expect(body).toMatchObject({ kind: 'rebrand', status: 'pending', target: `rebrand-${projectId}` });

      const rerun = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/rebrand/chapters/7`).body({});
      expect(rerun.statusCode).toBe(202);
      expect(rerun.json().target).toBe(`rebrand-${projectId}-ch-7`);
    });
  });

  describe('GET /api/v1/projects/:projectId/rebrand/chapters/:chapter', () => {
    it('should return the conversion and 404 unknown chapters with RBR_002', async () => {
      const projectId = await createProject();
      await testEnv
        .getPostgresClient()
        .insert(schema.chapterConversions)
        .values({ projectId: BigInt(projectId), chapter: 1, title: 'Awakening', body: 'Evan Vale rose.', status: 'converted' });

      const found = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/rebrand/chapters/1`);
      expect(found.statusCode).toBe(200);
      expect(found.json()).toMatchObject({ chapter: 1, title: 'Awakening', body: 'Evan Vale rose.', status: 'converted', revision: 1 });

      const missing = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/rebrand/chapters/99`);
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe('RBR_002');
    });
  });

  describe('GET /api/v1/projects/:projectId/rebrand/glossary + /manuscript', () => {
    it('should list glossary entries and join the converted manuscript', async () => {
      const projectId = await createProject();
      const db = testEnv.getPostgresClient();
      await db.insert(schema.rebrandGlossary).values([
        { projectId: BigInt(projectId), sourceName: 'Ye Fan', variants: ['Yefan'], replacement: 'Evan Vale', category: 'character', createdChapter: 0 },
        { projectId: BigInt(projectId), sourceName: 'Huaxia', replacement: 'Veldram', category: 'country', createdChapter: 0 },
      ]);
      await db.insert(schema.chapterConversions).values([
        { projectId: BigInt(projectId), chapter: 1, title: 'Awakening', body: 'Evan Vale rose.', status: 'converted' },
        { projectId: BigInt(projectId), chapter: 2, body: '', status: 'failed' },
      ]);

      const list = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/rebrand/chapters`);
      expect(list.statusCode).toBe(200);
      expect(list.json().items).toMatchObject([
        { chapter: 1, title: 'Awakening', status: 'converted', issueCount: 0, revision: 1 },
        { chapter: 2, status: 'failed', issueCount: 0 },
      ]);

      const glossary = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/rebrand/glossary?category=character`);
      expect(glossary.statusCode).toBe(200);
      expect(glossary.json().items).toEqual([{ sourceName: 'Ye Fan', variants: ['Yefan'], replacement: 'Evan Vale', category: 'character', notes: null, createdChapter: 0 }]);

      const manuscript = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/rebrand/manuscript`);
      expect(manuscript.statusCode).toBe(200);
      expect(manuscript.json().failedChapters).toEqual([2]);
      expect(manuscript.json().markdown).toContain('<!-- WARNING: chapter(s) 2 failed conversion');
      expect(manuscript.json().markdown).toContain('# Awakening\n\nEvan Vale rose.');
    });
  });
});
