import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_bible_builder_skip_visibility`;

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(baseConnectionString);
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

const ALL_STAGES = ['foundation', 'world', 'power', 'factionsAndLocations', 'characters', 'plot', 'volumes'];

describe.if(pgAvailable)('WorkflowRunService.runBibleBuilder — skip visibility after a reset that keeps the bible (AI-7 option b)', () => {
  let db: PrimaryDatabase;
  let sql: SQL;
  let service: WorkflowRunService;
  let structured: ReturnType<typeof mock>;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    sql = new SQL(url);
    db = drizzle({ client: sql, schema }) as unknown as PrimaryDatabase;
    structured = mock(async () => ({ body: 'stage prose' }));
    const modelRouter = {
      structured,
      bindRunSignal: () => new AbortController().signal,
      releaseRunSignal: () => undefined,
      abortRun: () => false,
    } as never;
    const indexingService = { addLore: async () => undefined } as never;
    service = new WorkflowRunService(
      { getPostgresClient: () => db } as never,
      {} as never,
      modelRouter,
      {} as never,
      {} as never,
      indexingService,
      {} as never,
      { publish: () => undefined } as never,
    );
    await service.onModuleInit();
  });

  afterAll(async () => {
    await sql?.close();
  });

  async function seedProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `bible-skip-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('should report no skipped stages on a first, from-empty build', async () => {
    const projectId = await seedProject();

    const result = await service.runBibleBuilder({ projectId, brief: 'a test brief' });

    expect(result.skippedStages).toEqual([]);
    expect(structured).toHaveBeenCalledTimes(ALL_STAGES.length);
  });

  it('should report every stage as skipped when a non-force rebuild follows a reset that kept the bible documents', async () => {
    const projectId = await seedProject();
    await service.runBibleBuilder({ projectId, brief: 'a test brief' });
    structured.mockClear();

    // AI-7 option (b): reset does not clear bible_documents/canon_facts, so a later non-force rebuild
    // finds every stage already has content — that must be visible on the run result, not silent.
    const result = await service.runBibleBuilder({ projectId, brief: 'a test brief' });

    expect(result.skippedStages).toEqual(expect.arrayContaining(ALL_STAGES));
    expect(result.skippedStages).toHaveLength(ALL_STAGES.length);
    expect(structured).not.toHaveBeenCalled();

    const run = await db.query.workflowRuns.findFirst({ where: eq(schema.workflowRuns.id, result.runId) });
    for (const stage of ALL_STAGES) expect(run?.nodeTrace).toContain(`skipped:${stage}`);
  });

  it('should report only the still-unwritten stages when force wrote some but not others', async () => {
    const projectId = await seedProject();
    await db.insert(schema.bibleDocuments).values({ projectId, section: 'project', slug: 'premise', body: 'already-written foundation' });

    const result = await service.runBibleBuilder({ projectId, brief: 'a test brief' });

    expect(result.skippedStages).toEqual(['foundation']);
    expect(structured).toHaveBeenCalledTimes(ALL_STAGES.length - 1);
  });
});
