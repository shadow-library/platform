import { MemorySaver } from '@langchain/langgraph';
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterFinalizationGraph, type FinalizationServices } from '@modules/ai/graphs/chapter-finalization.graph';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_finalization_resume`;

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

const delta = { newEntities: [{ entityKey: 'char_hero', name: 'Hero', type: 'character' }], appeared: ['char_hero'] };

describe.if(pgAvailable)('chapter finalization graph resume', () => {
  let db: PrimaryDatabase;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  function buildGraph(): ReturnType<typeof createChapterFinalizationGraph> {
    const modelRouter = { structured: async () => delta, resolveModel: () => ({ model: 'test-model' }) };
    const indexingService = { addProse: async () => undefined, addLore: async () => undefined };
    return createChapterFinalizationGraph({ db, modelRouter, indexingService, checkpointer: new MemorySaver() } as unknown as FinalizationServices);
  }

  async function seedPartiallyFinalizedChapter(reviewStatus: 'final' | 'needs_review'): Promise<{ projectId: bigint; draftId: bigint }> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `resume-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.chapters).values({ projectId: project.id, number: 1, content: 'ch1', summary: 's1', status: 'done', locked: true });
    const [draft] = await db.insert(schema.drafts).values({ projectId: project.id, chapter: 1, body: 'ch1', summary: 's1', status: 'final', reviewStatus }).returning();
    if (!draft) throw new Error('failed to seed draft');
    return { projectId: project.id, draftId: draft.id };
  }

  function invoke(projectId: bigint, draftId: bigint): Promise<unknown> {
    return buildGraph().invoke(
      { projectId: String(projectId), chapter: 1, draftId: String(draftId), prose: 'ch1', summary: 's1', title: 'One', generator: 'standard', runId: 'run-resume' },
      { configurable: { thread_id: `resume-${draftId}` } },
    );
  }

  it('should finish a chapter whose prose was already committed by a failed prior attempt', async () => {
    const { projectId, draftId } = await seedPartiallyFinalizedChapter('final');

    await invoke(projectId, draftId);

    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'char_hero')) });
    expect(chapter?.continuityApplied).toBe(true);
    expect(project?.storyCurrentChapter).toBe(1);
    expect(entity?.name).toBe('Hero');
  });

  it('should still refuse a draft that was never approved', async () => {
    const { projectId, draftId } = await seedPartiallyFinalizedChapter('needs_review');

    await expect(invoke(projectId, draftId)).rejects.toThrow(/is not approved/);
  });
});
