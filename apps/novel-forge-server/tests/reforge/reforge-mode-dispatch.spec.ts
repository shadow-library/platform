import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

import { JobExecutor } from '@modules/jobs/job.executor';
import * as schema from '@server/database/schemas';
import { TestEnvironment } from '@tests/test-environment';

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

const testEnv = new TestEnvironment('reforge_mode');

// Row ids and timestamps are the only response fields a fresh run cannot reproduce; everything else is
// compared byte-for-byte, which is the whole point of these goldens (design §13).
function golden(body: unknown): string {
  return JSON.stringify(body, (key, value) => (key === 'id' || key === 'jobId' || key === 'createdAt' || key === 'updatedAt' ? `<${key}>` : value));
}

describe.if(pgAvailable)('Reforge mode dispatch', () => {
  testEnv.init();

  async function createProject(): Promise<string> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `reforge-mode-${Math.random()}`, kind: 'source' });
    return response.json().id as string;
  }

  describe('chapter mode', () => {
    it('should serve the shipped chapter-mode responses unchanged', async () => {
      const projectId = await createProject();
      const db = testEnv.getPostgresClient();
      await testEnv
        .getRouter()
        .mockRequest()
        .put(`/api/v1/projects/${projectId}/reforge/config`)
        .body({ instructions: 'raise the prose', fidelity: 'close', settings: { judgeEnabled: false, targetWords: 3000 } });
      await db.insert(schema.chapters).values({ projectId: BigInt(projectId), number: 1, content: 'source one', status: 'done' });
      await db.insert(schema.chapterReforges).values([
        { projectId: BigInt(projectId), chapter: 1, title: 'Awakening', body: 'Evan Vale rose.', status: 'reforged', wordCount: 3 },
        { projectId: BigInt(projectId), chapter: 2, body: '', status: 'failed' },
      ]);

      // `mode` is the one field transform mode adds to a chapter-mode response — a panel cannot dispatch
      // without it. Every other byte is the pre-transform response.
      const status = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge`);
      expect(golden(status.json())).toBe(
        '{"reforge":{"id":"<id>","status":"pending","fidelity":"close","mode":"chapter","updatedAt":"<updatedAt>","instructions":"raise the prose","settings":{"targetWords":3000,"judgeEnabled":false},"lastError":null},"sourceChapters":1,"glossaryCount":0,"counts":{"reforged":1,"attention":0,"failed":1},"job":null}',
      );

      const list = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/chapters`);
      expect(golden(list.json())).toBe(
        '{"items":[{"chapter":1,"status":"reforged","issueCount":0,"revision":1,"updatedAt":"<updatedAt>","title":"Awakening","wordCount":3},{"chapter":2,"status":"failed","issueCount":0,"revision":1,"updatedAt":"<updatedAt>","title":null,"wordCount":null}]}',
      );

      const chapter = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/chapters/1`);
      expect(golden(chapter.json())).toBe(
        '{"chapter":1,"body":"Evan Vale rose.","status":"reforged","revision":1,"updatedAt":"<updatedAt>","title":"Awakening","summary":null,"sourceBeats":null,"changes":null,"fidelity":null,"issues":null,"wordCount":3}',
      );

      const manuscript = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/manuscript`);
      expect(manuscript.json().failedChapters).toEqual([2]);
      expect(manuscript.json().markdown).toContain('# Awakening\n\nEvan Vale rose.');
    });
  });

  describe('transform mode', () => {
    async function seedTransformProject(): Promise<{ projectId: string; planId: bigint }> {
      const projectId = await createProject();
      const db = testEnv.getPostgresClient();
      await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/reforge/config`).body({ mode: 'transform' });

      const [plan] = await db
        .insert(schema.reforgePlans)
        .values({ projectId: BigInt(projectId), revision: 1, status: 'approved', sourceChapterCount: 6, outputChapterCount: 3, approvedAt: new Date() })
        .returning();
      if (!plan) throw new Error('failed to seed plan');
      await db.insert(schema.reforgePlanSpans).values([
        { planId: plan.id, ordinal: 1, spanKey: 'span-one', fromChapter: 1, toChapter: 2, action: 'keep', targetChapters: 2, keptBeats: ['the duel'] },
        { planId: plan.id, ordinal: 2, spanKey: 'span-two', fromChapter: 3, toChapter: 6, action: 'condense', targetChapters: 1, keptBeats: ['the escape'] },
      ]);
      await db.insert(schema.reforgeCuts).values({
        planId: plan.id,
        cutKey: 'azure-sect-tribunal',
        kind: 'subplot',
        label: 'the Azure Sect tribunal subplot',
        aliases: ['Azure Sect'],
        disposition: 'cut',
        originSpanOrdinal: 2,
        firstSourceChapter: 3,
        lastSourceChapter: 6,
        effectiveFromOutput: 3,
      });
      return { projectId, planId: plan.id };
    }

    it('should force fidelity to loose and reject any other value with REF_008', async () => {
      const projectId = await createProject();
      const switched = await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/reforge/config`).body({ mode: 'transform', fidelity: 'preserve' });
      expect(switched.statusCode).toBe(400);
      expect(switched.json().code).toBe('REF_008');

      const ok = await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/reforge/config`).body({ mode: 'transform' });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ mode: 'transform', fidelity: 'loose' });

      const back = await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/reforge/config`).body({ mode: 'chapter', fidelity: 'close' });
      expect(back.json()).toMatchObject({ mode: 'chapter', fidelity: 'close' });
    });

    it('should report the plan, its outputs and its ledger, and render the output manuscript', async () => {
      const { projectId, planId } = await seedTransformProject();
      const db = testEnv.getPostgresClient();
      await db.insert(schema.reforgeOutputs).values([
        {
          projectId: BigInt(projectId),
          planId,
          outputChapter: 1,
          spanOrdinal: 1,
          spanKey: 'span-one',
          fromChapter: 1,
          toChapter: 1,
          indexInSpan: 0,
          title: 'The Duel',
          body: 'Evan Vale drew.',
          status: 'written',
          wordCount: 3,
        },
        {
          projectId: BigInt(projectId),
          planId,
          outputChapter: 2,
          spanOrdinal: 1,
          spanKey: 'span-one',
          fromChapter: 2,
          toChapter: 2,
          indexInSpan: 1,
          body: '',
          status: 'failed',
          issues: [{ source: 'run', type: 'run_failed', detail: 'output chapter 2 transform failed' }],
        },
      ]);

      const status = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge`);
      expect(status.json()).toMatchObject({
        reforge: { mode: 'transform', fidelity: 'loose' },
        counts: { reforged: 0, attention: 0, failed: 0 },
        transform: { plan: { revision: 1, status: 'approved', outputChapterCount: 3 }, counts: { written: 1, attention: 0, failed: 1 }, cuts: 1 },
      });

      const outputs = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/outputs`);
      expect(outputs.json().items).toMatchObject([
        { outputChapter: 1, spanOrdinal: 1, fromChapter: 1, toChapter: 1, indexInSpan: 0, title: 'The Duel', status: 'written', issueCount: 0, wordCount: 3 },
        { outputChapter: 2, status: 'failed', issueCount: 1 },
      ]);

      const output = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/outputs/1`);
      expect(output.json()).toMatchObject({ outputChapter: 1, body: 'Evan Vale drew.', status: 'written' });

      const missing = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/outputs/9`);
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe('REF_007');

      const cuts = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/cuts`);
      expect(cuts.json().items).toMatchObject([{ cutKey: 'azure-sect-tribunal', kind: 'subplot', disposition: 'cut', effectiveFromOutput: 3 }]);

      // The manuscript now reads the outputs, not chapter_reforges — and skips the failed row exactly as
      // the chapter-mode renderer does.
      const manuscript = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/manuscript`);
      expect(manuscript.json().markdown).toBe('# The Duel\n\nEvan Vale drew.');
    });

    it('should serialize the analysis metrics block', async () => {
      const projectId = await createProject();
      const db = testEnv.getPostgresClient();
      await db.insert(schema.reforgeAnalyses).values({
        projectId: BigInt(projectId),
        status: 'done',
        windowSize: 15,
        chaptersAnalyzed: 40,
        windowsFailed: 0,
        metrics: { repetitionRatio: 0.21, stallRatio: 0.14, medianWords: 2100, arcCount: 4, deadThreadCount: 3 },
        report: '# Source analysis',
      });

      const analysis = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/reforge/analysis`);
      expect(analysis.statusCode).toBe(200);
      expect(analysis.json().analysis).toMatchObject({ status: 'done', chaptersAnalyzed: 40, metrics: { repetitionRatio: 0.21, arcCount: 4 } });
    });

    it('should gate the transform stage on an approved plan', async () => {
      const projectId = await createProject();
      await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/reforge/config`).body({ mode: 'transform' });
      const executor = testEnv.getService(JobExecutor);
      (executor as { dispatch: (jobId: string) => Promise<void> }).dispatch = async () => undefined;

      const ungated = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/reforge/transform`).body({ limit: 5 });
      expect(ungated.statusCode).toBe(400);
      expect(ungated.json().code).toBe('REF_005');

      const { projectId: approvedProjectId } = await seedTransformProject();
      const started = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${approvedProjectId}/reforge/transform`).body({ limit: 5 });
      expect(started.statusCode).toBe(202);
      expect(started.json()).toMatchObject({ kind: 'reforge', status: 'pending', target: `reforge-${approvedProjectId}` });

      const rerun = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${approvedProjectId}/reforge/outputs/2`).body({});
      expect(rerun.statusCode).toBe(202);
      expect(rerun.json().target).toBe(`reforge-${approvedProjectId}-out-2`);
    });
  });
});
