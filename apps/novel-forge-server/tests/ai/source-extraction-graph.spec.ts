import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createSourceExtractionGraph, type ExtractionServices } from '@modules/ai/graphs/source-extraction.graph';
import { type ExtractionOutput } from '@modules/ai/schemas';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_source_extraction_graph`;

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

const extractionOutput: ExtractionOutput = {
  entities: [{ entityKey: 'amara', type: 'character', name: 'Detective Amara' }],
  relationships: [],
  beats: [{ beatKey: 'ch1_intro', chapter: 1, summary: 'Amara arrives at the scene.' }],
  plotThreads: [],
  worldFacts: [],
  mysteries: [],
  chapterSummary: 'Amara investigates the scene.',
};

describe.if(pgAvailable)('source-extraction.graph — isolated containment', () => {
  let db: PrimaryDatabase;
  let checkpointer: PostgresSaver;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    checkpointer = PostgresSaver.fromConnString(url);
    await checkpointer.setup();
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedChapter(isolated: boolean): Promise<{ projectId: bigint }> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `src-extract-${isolated}-${Date.now()}-${Math.random()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.chapters).values({ projectId: project.id, number: 1, content: 'Some source prose.', wordCount: 3, status: 'done', isolated });
    return { projectId: project.id };
  }

  function buildServices(structured: ReturnType<typeof mock>): ExtractionServices {
    const modelRouter = { structured } as unknown as ExtractionServices['modelRouter'];
    const indexingService = { addProse: mock(async () => undefined) } as unknown as ExtractionServices['indexingService'];
    return {
      db,
      contextAssembler: {} as ExtractionServices['contextAssembler'],
      modelRouter,
      telemetry: {} as ExtractionServices['telemetry'],
      toolRegistry: {} as ExtractionServices['toolRegistry'],
      indexingService,
      checkpointer,
    };
  }

  it('should skip knowledge extraction entirely for an isolated chapter', async () => {
    const { projectId } = await seedChapter(true);
    const structured = mock(async () => extractionOutput);
    const services = buildServices(structured);
    const graph = createSourceExtractionGraph(services);
    const runId = `source-extraction-isolated-${projectId}`;

    await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } });

    expect(structured).not.toHaveBeenCalled();
    const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'amara')) });
    expect(entity).toBeUndefined();
    const beat = await db.query.beats.findFirst({ where: and(eq(schema.beats.projectId, projectId), eq(schema.beats.beatKey, 'ch1_intro')) });
    expect(beat).toBeUndefined();
    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    expect(chapter?.summary).toBeNull();
  });

  it('should extract knowledge normally for a non-isolated chapter', async () => {
    const { projectId } = await seedChapter(false);
    const structured = mock(async () => extractionOutput);
    const services = buildServices(structured);
    const graph = createSourceExtractionGraph(services);
    const runId = `source-extraction-open-${projectId}`;

    await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } });

    expect(structured).toHaveBeenCalledTimes(1);
    const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'amara')) });
    expect(entity?.name).toBe('Detective Amara');
    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    expect(chapter?.summary).toBe('Amara investigates the scene.');
  });
});
