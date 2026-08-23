import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { JobExecutor } from '@modules/jobs/job.executor';
import { ReforgePromoteService } from '@modules/reforge/reforge-promote.service';
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

const testEnv = new TestEnvironment('reforge_promote');

describe.if(pgAvailable)('Reforge promotion', () => {
  testEnv.init();

  async function createSourceProject(): Promise<string> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `reforge-promote-${Math.random()}`, kind: 'source', title: 'Ashes of Veldram' });
    return response.json().id as string;
  }

  async function seedApprovedTransform(outputs = 2, options: { failLast?: boolean } = {}): Promise<{ projectId: string; planId: bigint }> {
    const projectId = await createSourceProject();
    const db = testEnv.getPostgresClient();
    await testEnv.getRouter().mockRequest().put(`/api/v1/projects/${projectId}/reforge/config`).body({ mode: 'transform' });

    const [plan] = await db
      .insert(schema.reforgePlans)
      .values({ projectId: BigInt(projectId), revision: 1, status: 'approved', sourceChapterCount: 6, outputChapterCount: outputs, approvedAt: new Date() })
      .returning();
    if (!plan) throw new Error('failed to seed plan');
    await db.insert(schema.reforgePlanSpans).values([
      {
        planId: plan.id,
        ordinal: 1,
        spanKey: 'span-one',
        fromChapter: 1,
        toChapter: 3,
        action: 'condense',
        targetChapters: 1,
        arcLabel: 'The Gate Trials',
        keptBeats: ['the duel'],
      },
      {
        planId: plan.id,
        ordinal: 2,
        spanKey: 'span-two',
        fromChapter: 4,
        toChapter: 6,
        action: 'condense',
        targetChapters: 1,
        arcLabel: 'The Ash Road',
        keptBeats: ['the escape'],
      },
    ]);
    await db.insert(schema.reforgeOutputs).values(
      Array.from({ length: outputs }, (_, i) => ({
        projectId: BigInt(projectId),
        planId: plan.id,
        outputChapter: i + 1,
        spanOrdinal: i + 1,
        spanKey: i === 0 ? 'span-one' : 'span-two',
        fromChapter: i * 3 + 1,
        toChapter: i * 3 + 3,
        indexInSpan: 0,
        title: `Output ${i + 1}`,
        body: `Prose of output ${i + 1}.`,
        status: options.failLast && i === outputs - 1 ? ('failed' as const) : ('written' as const),
      })),
    );
    return { projectId, planId: plan.id };
  }

  it('should land the outputs as a publishable project and publish chapter 1 of it', async () => {
    const { projectId, planId } = await seedApprovedTransform();
    const db = testEnv.getPostgresClient();

    const result = await testEnv.getService(ReforgePromoteService).promote(BigInt(projectId), { seedVolumes: true });
    expect(result).toMatchObject({ chapters: 2, volumes: 2, alreadyPromoted: false });

    const promoted = await db.query.projects.findFirst({ where: eq(schema.projects.id, result.projectId) });
    expect(promoted).toMatchObject({ kind: 'new_novel', title: 'Ashes of Veldram', sourceProjectId: BigInt(projectId) });
    expect(await db.query.reforgePlans.findFirst({ where: eq(schema.reforgePlans.id, planId) })).toMatchObject({ promotedProjectId: result.projectId });

    const chapters = await db.query.chapters.findMany({ where: eq(schema.chapters.projectId, result.projectId) });
    expect(chapters).toHaveLength(2);
    // Landed exactly like a `final`-mode import: numbered from 1, human-authored, locked, publishable.
    expect(chapters[0]).toMatchObject({ number: 1, title: 'Output 1', content: 'Prose of output 1.', status: 'done', generator: 'human', locked: true, wordCount: 4 });

    // The bible placeholders and the seeded volumes make the promoted project immediately workable.
    expect(await db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, result.projectId) })).toHaveLength(schema.bibleSection.enumValues.length);
    const volumes = await db.query.volumes.findMany({ where: eq(schema.volumes.projectId, result.projectId) });
    expect(volumes).toMatchObject([
      { volumeKey: 'vol-1', title: 'The Gate Trials', startChapter: 1, endChapter: 1 },
      { volumeKey: 'vol-2', title: 'The Ash Road', startChapter: 2, endChapter: 2 },
    ]);

    const published = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${result.projectId}/publish`).body({ title: 'Ashes of Veldram' });
    expect(published.statusCode).toBe(200);
    const chapter = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${result.projectId}/chapters/1/publish`).body({});
    expect(chapter.statusCode).toBe(202);
    expect(chapter.json()).toMatchObject({ chapter: 1, publishedOrdinal: 1 });
  });

  it('should be idempotent per plan revision', async () => {
    const { projectId } = await seedApprovedTransform();
    const service = testEnv.getService(ReforgePromoteService);

    const first = await service.promote(BigInt(projectId), {});
    const second = await service.promote(BigInt(projectId), {});

    expect(second).toMatchObject({ projectId: first.projectId, alreadyPromoted: true });
    const chapters = await testEnv.getPostgresClient().query.chapters.findMany({ where: eq(schema.chapters.projectId, first.projectId) });
    expect(chapters).toHaveLength(2);
  });

  it('should refuse an incomplete transform with REF_009', async () => {
    const { projectId } = await seedApprovedTransform(2, { failLast: true });
    const executor = testEnv.getService(JobExecutor);
    (executor as { dispatch: (jobId: string) => Promise<void> }).dispatch = async () => undefined;

    const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/reforge/promote`).body({});
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('REF_009');
  });

  it('should enqueue the promote stage once the transform is complete', async () => {
    const { projectId } = await seedApprovedTransform();
    const executor = testEnv.getService(JobExecutor);
    (executor as { dispatch: (jobId: string) => Promise<void> }).dispatch = async () => undefined;

    const response = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/reforge/promote`).body({ title: 'Ashes Reforged', seedVolumes: true });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ kind: 'reforge', status: 'pending', target: `reforge-promote-${projectId}` });
  });
});
