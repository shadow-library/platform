import { MemorySaver } from '@langchain/langgraph';
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createSourceExtractionGraph, type ExtractionServices } from '@modules/ai/graphs/source-extraction.graph';
import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { type ExtractionOutput } from '@modules/ai/schemas';
import { type TelemetryContext } from '@modules/ai/telemetry.handler';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_source_extraction_telemetry`;

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

const EMPTY_EXTRACTION: ExtractionOutput = { entities: [], relationships: [], beats: [], plotThreads: [], worldFacts: [], mysteries: [], chapterSummary: '' };

describe.if(pgAvailable)('source-extraction.graph telemetry', () => {
  let db: PrimaryDatabase;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  it("should log the extraction prompt's real version, not a hardcoded one", async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `extraction-telemetry-${Date.now()}-${Math.random()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.chapters).values({ projectId: project.id, number: 1, content: 'ch1 content', status: 'done' });

    const seenCtx: TelemetryContext[] = [];
    const modelRouter = {
      structured: async (_prompt: unknown, _input: unknown, ctx: TelemetryContext) => {
        seenCtx.push(ctx);
        return EMPTY_EXTRACTION;
      },
      resolveModel: () => ({ provider: 'test', model: 'test' }),
      resolveFor: async () => ({ provider: 'test', model: 'test' }),
    };
    const indexingService = { addProse: async () => undefined, addLore: async () => undefined };

    const graph = createSourceExtractionGraph({ db, modelRouter, indexingService, checkpointer: new MemorySaver() } as unknown as ExtractionServices);
    const runId = `source-extraction-${project.id}`;
    await graph.invoke({ projectId: String(project.id), chapter: 1, runId }, { configurable: { thread_id: runId } });

    expect(seenCtx).toHaveLength(1);
    // Reads the version from the prompt module rather than a hardcoded literal, so a version bump in
    // extraction.prompt.ts is reflected here automatically instead of silently going stale.
    expect(seenCtx[0]?.promptVersion).toBe(PROMPT_REGISTRY.extraction.version);
  });
});
