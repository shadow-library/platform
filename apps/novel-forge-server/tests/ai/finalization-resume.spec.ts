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
const deltaB = { newEntities: [{ entityKey: 'char_rival', name: 'Rival', type: 'character' }], appeared: ['char_rival'] };

describe.if(pgAvailable)('chapter finalization graph resume', () => {
  let db: PrimaryDatabase;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  function buildGraph(options: { structured?: () => Promise<unknown>; failCursor?: boolean } = {}): ReturnType<typeof createChapterFinalizationGraph> {
    const modelRouter = { structured: options.structured ?? (async () => delta), resolveModel: () => ({ model: 'test-model' }) };
    const indexingService = { addProse: async () => undefined, addLore: async () => undefined };

    // advanceCursor is the only node that updates `projects` outside a transaction, so trapping that one table
    // fails the run exactly where a cursor write would — extractContinuity's claim write must still go through.
    const client = options.failCursor
      ? new Proxy(db, {
          get: (target, prop) => {
            const value = Reflect.get(target, prop) as unknown;
            if (prop === 'update')
              return (table: unknown) => {
                if (table === schema.projects) throw new Error('cursor update failed');
                return (value as (t: unknown) => unknown).call(target, table);
              };
            return typeof value === 'function' ? value.bind(target) : value;
          },
        })
      : db;

    return createChapterFinalizationGraph({ db: client, modelRouter, indexingService, checkpointer: new MemorySaver() } as unknown as FinalizationServices);
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

  function invoke(projectId: bigint, draftId: bigint, options: Parameters<typeof buildGraph>[0] & { runId?: string } = {}): Promise<unknown> {
    return buildGraph(options).invoke(
      {
        projectId: String(projectId),
        chapter: 1,
        draftId: String(draftId),
        prose: 'ch1',
        summary: 's1',
        title: 'One',
        generator: 'standard',
        runId: options.runId ?? 'run-resume',
      },
      { configurable: { thread_id: `resume-${draftId}-${options.runId ?? 'run-resume'}` } },
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

  it('should not re-extract or reapply continuity when resuming after continuityApplied=true but cursor advancement failed', async () => {
    const { projectId, draftId } = await seedPartiallyFinalizedChapter('final');
    let calls = 0;
    const structured = async (): Promise<unknown> => {
      calls += 1;
      return calls === 1 ? delta : deltaB;
    };

    await expect(invoke(projectId, draftId, { structured, failCursor: true })).rejects.toThrow(/cursor update failed/);

    const afterFailure = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    expect(afterFailure?.continuityApplied).toBe(true);

    await invoke(projectId, draftId, { structured });

    const proposal = await db.query.continuityProposals.findFirst({ where: and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, 1)) });
    const rival = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'char_rival')) });
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(calls).toBe(1);
    expect(proposal?.proposal).toEqual(delta);
    expect(rival).toBeUndefined();
    expect(project?.storyCurrentChapter).toBe(1);
  });

  it('should apply exactly one continuity delta when two finalize calls race for the same chapter', async () => {
    const { projectId, draftId } = await seedPartiallyFinalizedChapter('final');
    let entered = 0;
    let openGate = (): void => undefined;
    const gate = new Promise<void>(resolve => (openGate = resolve));

    // The winner of the claim parks inside `structured` until the loser has settled, so the loser evaluates the
    // claim while it is held and un-applied. `entered === 2` is the escape hatch for a regressed claim: both
    // extractions would proceed instead of hanging, and the assertions below report the double apply.
    const structuredFor = (value: unknown) => async (): Promise<unknown> => {
      entered += 1;
      if (entered === 2) openGate();
      await gate;
      return value;
    };

    const first = invoke(projectId, draftId, { structured: structuredFor(delta), runId: 'run-race-a' });
    const second = invoke(projectId, draftId, { structured: structuredFor(deltaB), runId: 'run-race-b' });
    void Promise.race([first.catch(() => undefined), second.catch(() => undefined)]).then(openGate);

    const results = await Promise.allSettled([first, second]);
    const rejected = results.filter(r => r.status === 'rejected');
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/already in progress/);
    expect(entered).toBe(1);

    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    const entities = await db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId) });
    expect(chapter?.continuityApplied).toBe(true);
    expect(entities.map(e => e.entityKey)).toHaveLength(1);

    // The winner advanced the cursor, which `guard` would reject on the retry; rewinding it puts the retry in
    // the state a losing run reaches when its own attempt died before advanceCursor.
    await db.update(schema.projects).set({ storyCurrentChapter: 0 }).where(eq(schema.projects.id, projectId));
    await invoke(projectId, draftId, { structured: structuredFor(deltaB), runId: 'run-race-retry' });

    const afterRetry = await db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId) });
    expect(afterRetry).toHaveLength(1);
    expect(entered).toBe(1);
  });

  it('should release the continuity claim when extraction fails so an immediate retry is not blocked', async () => {
    const { projectId, draftId } = await seedPartiallyFinalizedChapter('final');
    const structured = async (): Promise<unknown> => {
      throw new Error('extractor exploded');
    };

    await expect(invoke(projectId, draftId, { structured, runId: 'run-fail' })).rejects.toThrow(/extractor exploded/);

    const afterFailure = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    expect(afterFailure?.continuityClaimedAt).toBeNull();
    expect(afterFailure?.continuityClaimedBy).toBeNull();
    expect(afterFailure?.continuityApplied).toBe(false);

    await invoke(projectId, draftId, { runId: 'run-fail-retry' });

    const afterRetry = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    const hero = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'char_hero')) });
    expect(afterRetry?.continuityApplied).toBe(true);
    expect(hero?.name).toBe('Hero');
  });

  it('should still refuse a draft that was never approved', async () => {
    const { projectId, draftId } = await seedPartiallyFinalizedChapter('needs_review');

    await expect(invoke(projectId, draftId)).rejects.toThrow(/is not approved/);
  });
});
