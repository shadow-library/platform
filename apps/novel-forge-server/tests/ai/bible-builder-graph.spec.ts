import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createBibleBuilderGraph } from '@modules/ai/graphs/bible-builder.graph';
import { type BibleStageOutput } from '@modules/ai/schemas';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_bible_builder_graph`;

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

function buildServices(db: PrimaryDatabase, checkpointer: PostgresSaver, stageOutput: BibleStageOutput) {
  const modelRouter = { structured: async () => stageOutput, resolveModel: () => ({ provider: 'test', model: 'test' }) };
  const contextAssembler = { forChapter: async () => ({ id: null }) };
  const toolRegistry = { forNode: () => [], getRaw: () => [] };

  return { db, contextAssembler, modelRouter, telemetry: {}, toolRegistry, indexingService: {}, checkpointer } as never;
}

describe.if(pgAvailable)('bible-builder.graph characters stage persistence', () => {
  let db: PrimaryDatabase;
  let checkpointer: PostgresSaver;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    checkpointer = PostgresSaver.fromConnString(url);
    await checkpointer.setup();
  });

  async function seedProject(name: string): Promise<bigint> {
    const [project] = await db.insert(schema.projects).values({ name, kind: 'new_novel' }).returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  async function runCharactersStage(projectId: bigint, output: BibleStageOutput, force: boolean, threadSuffix: string): Promise<void> {
    const graph = createBibleBuilderGraph(buildServices(db, checkpointer, output));
    const runId = `bible-builder-${projectId}-${threadSuffix}`;
    await graph.invoke({ projectId: String(projectId), brief: 'A test brief.', force, runId }, { configurable: { thread_id: runId } });
  }

  it('persists an entity body card on the characters stage', async () => {
    const projectId = await seedProject(`bible-body-${Date.now()}`);
    await runCharactersStage(
      projectId,
      {
        body: 'Characters bible prose.',
        entities: [{ entityKey: 'amara', name: 'Detective Amara', type: 'character', body: 'Full entity card prose for Amara.' }],
      },
      false,
      'initial',
    );

    const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'amara')) });
    expect(entity?.body).toBe('Full entity card prose for Amara.');
  });

  it('does not null out a previously-persisted body when a forced rebuild omits it (COALESCE, same as name/notes)', async () => {
    const projectId = await seedProject(`bible-rebuild-${Date.now()}`);
    await runCharactersStage(
      projectId,
      { body: 'Characters bible prose.', entities: [{ entityKey: 'amara', name: 'Detective Amara', type: 'character', body: 'Original full entity card.' }] },
      false,
      'first',
    );

    await runCharactersStage(
      projectId,
      { body: 'Characters bible prose, rebuilt.', entities: [{ entityKey: 'amara', name: 'Detective Amara', type: 'character' }] },
      true,
      'rebuild',
    );

    const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'amara')) });
    expect(entity?.body).toBe('Original full entity card.');
  });

  it('overwrites the body when the rebuild output supplies a fresh one', async () => {
    const projectId = await seedProject(`bible-overwrite-${Date.now()}`);
    await runCharactersStage(
      projectId,
      { body: 'Characters bible prose.', entities: [{ entityKey: 'amara', name: 'Detective Amara', type: 'character', body: 'Original full entity card.' }] },
      false,
      'first',
    );

    await runCharactersStage(
      projectId,
      { body: 'Characters bible prose, rebuilt.', entities: [{ entityKey: 'amara', name: 'Detective Amara', type: 'character', body: 'Rebuilt full entity card.' }] },
      true,
      'rebuild',
    );

    const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'amara')) });
    expect(entity?.body).toBe('Rebuilt full entity card.');
  });

  it('persists canon facts with terms from the characters stage, retrievable via db.query.canonFacts', async () => {
    const projectId = await seedProject(`bible-facts-${Date.now()}`);
    await runCharactersStage(
      projectId,
      {
        body: 'Characters bible prose.',
        entities: [{ entityKey: 'amara', name: 'Detective Amara', type: 'character' }],
        facts: [
          {
            factKey: 'amara_secret_past',
            text: 'Amara was once the forger the ledger investigation targets.',
            subjects: ['amara'],
            constraintNote: 'Narration must not state this before the reveal chapter.',
            terms: ['forger', 'forged the ledger'],
            revealChapter: 12,
          },
        ],
      },
      false,
      'facts',
    );

    const fact = await db.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, projectId), eq(schema.canonFacts.factKey, 'amara_secret_past')) });
    expect(fact?.text).toBe('Amara was once the forger the ledger investigation targets.');
    expect(fact?.subjects).toEqual(['amara']);
    expect(fact?.terms).toEqual(['forger', 'forged the ledger']);
    expect(fact?.revealChapter).toBe(12);
  });

  it('skips the characters stage entirely (no entity/fact writes) when force is false and the document already exists', async () => {
    const projectId = await seedProject(`bible-skip-${Date.now()}`);
    await runCharactersStage(
      projectId,
      { body: 'Characters bible prose.', entities: [{ entityKey: 'amara', name: 'Detective Amara', type: 'character', body: 'Original.' }] },
      false,
      'first',
    );

    await runCharactersStage(
      projectId,
      {
        body: 'This should never be written.',
        entities: [{ entityKey: 'someone_else', name: 'Should Not Exist', type: 'character', body: 'Should not persist.' }],
      },
      false,
      'second',
    );

    const skipped = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'someone_else')) });
    expect(skipped).toBeUndefined();

    const original = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'amara')) });
    expect(original?.body).toBe('Original.');
  });
});
