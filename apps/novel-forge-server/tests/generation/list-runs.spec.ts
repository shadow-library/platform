import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { noPluginProposals } from '@tests/fixtures/plugin-policy';
import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_list_runs`;

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

describe.if(pgAvailable)('listRuns — background-graph filtering', () => {
  let db: PrimaryDatabase;
  let service: GenerationService;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;
    // listRuns is a pure DB read — every AI collaborator can be a stub.
    service = new GenerationService(databaseService, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noPluginProposals());

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `list-runs-${Date.now()}`, kind: 'new_novel', premise: 'runs-list test' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;

    await db.insert(schema.workflowRuns).values([
      { projectId, graph: 'chapter-generation', target: 'chapter-1', status: 'completed' },
      { projectId, graph: 'bible-audit', target: 'bible', status: 'completed' },
      { projectId, graph: 'chat-title', target: 'session:x', status: 'running' },
      { projectId, graph: 'chat-compact', target: 'session:x', status: 'completed' },
      { projectId, graph: 'ideation-name', target: 'seed:1', status: 'running' },
    ]);
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('excludes background-graph runs and keeps author-facing ones', async () => {
    const runs = await service.listRuns(projectId);
    const graphs = runs.map(run => run.graph).sort();

    expect(graphs).toEqual(['bible-audit', 'chapter-generation']);
  });

  it('never reports a running background run, so hasRunningRun cannot fire on it', async () => {
    const runs = await service.listRuns(projectId);
    expect(runs.some(run => run.status === 'running')).toBe(false);
  });
});
