import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterFinalizationGraph } from '@modules/ai/graphs/chapter-finalization.graph';
import { type ContinuityOutput } from '@modules/ai/schemas';
import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_continuity_apply`;

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

function delta(overrides: Partial<ContinuityOutput> = {}): ContinuityOutput {
  return {
    appeared: [],
    newEntities: [],
    threads: [],
    mysteries: [],
    timeline: [],
    relationships: [],
    power: [],
    characterStates: [],
    knowledgeChanges: [],
    chapterSummary: 'Things happened.',
    ...overrides,
  } as ContinuityOutput;
}

describe.if(pgAvailable)('continuity delta application', () => {
  let db: PrimaryDatabase;
  let checkpointer: PostgresSaver;
  let service: GenerationService;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    checkpointer = PostgresSaver.fromConnString(url);
    await checkpointer.setup();
    const noop = {} as never;
    service = new GenerationService({ getPostgresClient: () => db } as never, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  });

  async function seedProject(name: string): Promise<bigint> {
    const [project] = await db.insert(schema.projects).values({ name, kind: 'new_novel' }).returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  async function runFinalization(projectId: bigint, output: ContinuityOutput, threadSuffix: string): Promise<void> {
    const [draft] = await db.insert(schema.drafts).values({ projectId, chapter: 1, body: 'draft body', status: 'draft', reviewStatus: 'approved' }).returning();
    if (!draft) throw new Error('failed to seed draft');

    const services = {
      db,
      contextAssembler: {},
      modelRouter: { structured: async () => output, resolveModel: () => ({ provider: 'test', model: 'test' }) },
      telemetry: {},
      toolRegistry: {},
      indexingService: { addProse: async () => undefined, addLore: async () => undefined },
      checkpointer,
    } as never;

    const graph = createChapterFinalizationGraph(services);
    const runId = `finalization-${projectId}-${threadSuffix}`;
    await graph.invoke(
      { projectId: String(projectId), chapter: 1, runId, draftId: String(draft.id), prose: 'The prose of chapter one.', summary: 'A summary.', title: 'One' },
      { configurable: { thread_id: runId } },
    );
  }

  async function applyViaEndpoint(projectId: bigint, output: ContinuityOutput, chapter = 1): Promise<void> {
    await db.insert(schema.chapters).values({ projectId, number: chapter, content: 'ch', status: 'done', generator: 'grok', locked: true }).onConflictDoNothing();
    await db
      .insert(schema.continuityProposals)
      .values({ projectId, chapter, proposal: output as never, model: 'test', status: 'pending' })
      .onConflictDoNothing();
    await service.applyContinuityProposal(projectId, chapter);
  }

  it('should set chapters.continuityApplied when the finalization graph applies a delta', async () => {
    const projectId = await seedProject(`cont-d7-${Date.now()}`);
    await runFinalization(projectId, delta({ appeared: [] }), 'd7');

    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    expect(chapter?.continuityApplied).toBe(true);

    const proposal = await db.query.continuityProposals.findFirst({ where: eq(schema.continuityProposals.projectId, projectId) });
    expect(proposal?.status).toBe('applied');
  });

  it('should persist relationships from the graph path', async () => {
    const projectId = await seedProject(`cont-rel-graph-${Date.now()}`);
    await runFinalization(
      projectId,
      delta({
        newEntities: [{ entityKey: 'amara', name: 'Amara', type: 'character' }],
        relationships: [{ entityKey: 'amara', targetKey: 'rook', kind: 'rival', note: 'traded threats' }],
      }),
      'rel',
    );

    const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, 'amara')) });
    const rows = await db.query.entityRelationships.findMany({ where: eq(schema.entityRelationships.projectId, projectId) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityId: entity?.id, targetKey: 'rook', kind: 'rival', note: 'traded threats', chapter: 1 });
  });

  it('should persist relationships from the manual endpoint and skip unresolvable entity keys', async () => {
    const projectId = await seedProject(`cont-rel-manual-${Date.now()}`);
    await db.insert(schema.entities).values({ projectId, entityKey: 'amara', name: 'Amara', type: 'character' });
    await applyViaEndpoint(
      projectId,
      delta({
        relationships: [
          { entityKey: 'amara', targetKey: 'rook', kind: 'rival' },
          { entityKey: 'ghost', targetKey: 'rook', kind: 'ally' },
        ],
      }),
    );

    const rows = await db.query.entityRelationships.findMany({ where: eq(schema.entityRelationships.projectId, projectId) });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetKey).toBe('rook');
  });

  it('should upsert character states and not null out fields omitted by a later chapter', async () => {
    const projectId = await seedProject(`cont-state-${Date.now()}`);
    await applyViaEndpoint(
      projectId,
      delta({
        characterStates: [{ entityKey: 'amara', location: 'the docks', conditions: ['wounded'], immediateGoal: 'find the ledger', statusNote: 'shaken', evidence: 'she limped' }],
      }),
      1,
    );

    let state = await db.query.characterStates.findFirst({ where: and(eq(schema.characterStates.projectId, projectId), eq(schema.characterStates.entityKey, 'amara')) });
    expect(state).toMatchObject({ location: 'the docks', conditions: ['wounded'], immediateGoal: 'find the ledger', statusNote: 'shaken', lastUpdatedChapter: 1 });

    await applyViaEndpoint(projectId, delta({ characterStates: [{ entityKey: 'amara', location: 'the safehouse', evidence: 'she reached the door' }] }), 2);

    state = await db.query.characterStates.findFirst({ where: and(eq(schema.characterStates.projectId, projectId), eq(schema.characterStates.entityKey, 'amara')) });
    expect(state).toMatchObject({ location: 'the safehouse', conditions: ['wounded'], immediateGoal: 'find the ledger', statusNote: 'shaken', lastUpdatedChapter: 2 });
  });

  it('should never write knowledge changes into the character-knowledge ledger', async () => {
    const projectId = await seedProject(`cont-knowledge-${Date.now()}`);
    const [entity] = await db.insert(schema.entities).values({ projectId, entityKey: 'amara', name: 'Amara', type: 'character' }).returning();
    await db.insert(schema.canonFacts).values({ projectId, factKey: 'the-heir', text: 'Amara is the heir.' });
    const knowledgeChanges = [{ entityKey: 'amara', factKey: 'the-heir', how: 'overheard the steward' }];

    await runFinalization(projectId, delta({ knowledgeChanges }), 'knowledge');
    await applyViaEndpoint(projectId, delta({ knowledgeChanges }), 2);

    const ledger = await db.query.characterKnowledge.findMany({ where: eq(schema.characterKnowledge.projectId, projectId) });
    expect(ledger).toHaveLength(0);
    expect(entity).toBeDefined();
  });

  it('should still apply an edited pending proposal through the manual endpoint and flag the chapter', async () => {
    const projectId = await seedProject(`cont-manual-${Date.now()}`);
    await db.insert(schema.chapters).values({ projectId, number: 1, content: 'ch', status: 'done', generator: 'grok', locked: true });
    await db.insert(schema.continuityProposals).values({ projectId, chapter: 1, proposal: delta() as never, model: 'test', status: 'pending' });

    await service.updateContinuityProposal(projectId, 1, {
      proposal: delta({
        newEntities: [{ entityKey: 'rook', name: 'Rook', type: 'character' }],
        appeared: ['rook'],
        threads: [{ threadKey: 'the-ledger', status: 'open' }],
      }) as never,
    });
    const applied = await service.applyContinuityProposal(projectId, 1);

    expect(applied.status).toBe('applied');
    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    expect(chapter?.continuityApplied).toBe(true);
    const thread = await db.query.plotThreads.findFirst({ where: eq(schema.plotThreads.projectId, projectId) });
    expect(thread).toMatchObject({ threadKey: 'the-ledger', status: 'open', openedChapter: 1 });
    const appearance = await db.query.entityAppearances.findMany({ where: eq(schema.entityAppearances.projectId, projectId) });
    expect(appearance).toHaveLength(1);
    expect(appearance[0]).toMatchObject({ chapter: 1, firstChapter: 1, lastChapter: 1 });
  });

  it('should track lastAdvancedChapter on threads and mysteries across insert and re-mention', async () => {
    const projectId = await seedProject(`cont-advance-${Date.now()}`);
    await applyViaEndpoint(
      projectId,
      delta({ threads: [{ threadKey: 'the-ledger', status: 'open' }], mysteries: [{ mysteryKey: 'who-took-it', status: 'open', question: 'Who took the ledger?' }] }),
      1,
    );

    let thread = await db.query.plotThreads.findFirst({ where: eq(schema.plotThreads.projectId, projectId) });
    let mystery = await db.query.mysteries.findFirst({ where: eq(schema.mysteries.projectId, projectId) });
    expect(thread).toMatchObject({ lastAdvancedChapter: 1 });
    expect(mystery).toMatchObject({ lastAdvancedChapter: 1 });

    await applyViaEndpoint(projectId, delta({ threads: [{ threadKey: 'the-ledger', status: 'open' }], mysteries: [{ mysteryKey: 'who-took-it', status: 'open' }] }), 5);

    thread = await db.query.plotThreads.findFirst({ where: eq(schema.plotThreads.projectId, projectId) });
    mystery = await db.query.mysteries.findFirst({ where: eq(schema.mysteries.projectId, projectId) });
    expect(thread).toMatchObject({ lastAdvancedChapter: 5, openedChapter: 1 });
    expect(mystery).toMatchObject({ lastAdvancedChapter: 5, openedChapter: 1 });
  });
});
