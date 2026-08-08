import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createNovelValidationGraph } from '@modules/ai/graphs/novel-validation.graph';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_validation_persist`;

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

describe.if(pgAvailable)('novel-validation persistReport', () => {
  let db: PrimaryDatabase;

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());
  let checkpointer: PostgresSaver;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    checkpointer = PostgresSaver.fromConnString(url);
  });

  it('writes a validation_reports row for the run (no chapters → no LLM calls)', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `val-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');

    // With no finalized chapters, planWindows yields no windows, so validateWindows never calls a model.
    const services = { db, contextAssembler: {}, modelRouter: {}, telemetry: {}, toolRegistry: {}, indexingService: {}, checkpointer } as never;
    const graph = createNovelValidationGraph(services);

    await graph.invoke({ projectId: String(project.id), runId: 'val-run-1' }, { configurable: { thread_id: 'val-run-1' } });

    const reports = await db.query.validationReports.findMany({ where: eq(schema.validationReports.projectId, project.id) });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.scope).toBe('novel');
    expect(reports[0]?.issues).toBe(0);
  });
});
