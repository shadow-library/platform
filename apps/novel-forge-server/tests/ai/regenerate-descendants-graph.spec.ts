import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterGenerationGraph } from '@modules/ai/graphs/chapter-generation.graph';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginPolicy } from '@tests/fixtures/plugin-policy';
import { FULL_LENGTH_DRAFT_BODY } from '@tests/fixtures/draft-body';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_regenerate_descendants_graph`;

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

const COMPLIANT = { verdict: 'consistent', findings: [], briefCompliance: { compliant: true, issues: [] }, readabilityCompliance: { compliant: true, issues: [] } };

describe.if(pgAvailable)('chapter generation over an existing draft', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(drafts: Omit<typeof schema.drafts.$inferInsert, 'projectId'>[]): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `regen-graph-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    if (drafts.length > 0) await db.insert(schema.drafts).values(drafts.map(draft => ({ ...draft, projectId: project.id })));
    return project.id;
  }

  async function regenerate(projectId: bigint, chapter: number): Promise<void> {
    const modelRouter = {
      structured: async (promptModule: { key: string }) =>
        promptModule.key === 'generation' ? { title: 'The Climb', body: FULL_LENGTH_DRAFT_BODY, summary: 'Orrin climbs.', state: {} } : { title: 'The Climb' },
      chatFor: () => ({ bindTools: () => ({ invoke: async () => new AIMessage(JSON.stringify(COMPLIANT)) }) }),
      resolveModel: () => ({ provider: 'test', model: 'test' }),
      resolveFor: async () => ({ provider: 'test', model: 'test' }),
    };
    const services = {
      db,
      contextAssembler: { forChapter: async () => ({ id: null }) },
      modelRouter,
      telemetry: {},
      toolRegistry: { forNode: () => [], getRaw: () => [] },
      indexingService: {},
      pluginPolicy: noPluginPolicy(),
      checkpointer: new MemorySaver(),
    } as never;
    const runId = `regen-graph-${projectId}-${chapter}`;
    const input = { projectId: String(projectId), chapter, volumeKey: '', guidance: '', autoFix: true, maxFixes: 1, runId };
    await createChapterGenerationGraph(services).invoke(input, { configurable: { thread_id: runId } });
  }

  async function draftsOf(projectId: bigint): Promise<(typeof schema.drafts.$inferSelect)[]> {
    return db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: schema.drafts.chapter });
  }

  async function revisionsOf(projectId: bigint): Promise<{ revision: number; source: string; body: string }[]> {
    const rows = await db.query.draftRevisions.findMany({ where: eq(schema.draftRevisions.projectId, projectId), orderBy: schema.draftRevisions.revision });
    return rows.map(({ revision, source, body }) => ({ revision, source, body }));
  }

  it('should replace an approved draft for review, keep its prose in history and mark later drafts stale', async () => {
    const projectId = await seedProject([
      { chapter: 1, body: 'Orrin climbed the old tower.', reviewStatus: 'approved' },
      { chapter: 2, body: 'From the tower, Orrin saw the tide.', reviewStatus: 'approved' },
    ]);
    await db.insert(schema.continuityProposals).values({ projectId, chapter: 1, proposal: {} });

    await regenerate(projectId, 1);

    const [first, second] = await draftsOf(projectId);
    expect(first).toMatchObject({ body: FULL_LENGTH_DRAFT_BODY, revision: 1, staleReason: null, reviewStatus: 'needs_review', generator: 'standard', isolated: false });
    expect(second).toMatchObject({ body: 'From the tower, Orrin saw the tide.', staleReason: 'ancestor chapter 1 was regenerated', reviewStatus: 'needs_review' });
    expect(await revisionsOf(projectId)).toEqual([
      { revision: 0, source: 'generated', body: 'Orrin climbed the old tower.' },
      { revision: 1, source: 'generated', body: FULL_LENGTH_DRAFT_BODY },
    ]);
    expect(await db.query.continuityProposals.findFirst({ where: eq(schema.continuityProposals.projectId, projectId) })).toBeUndefined();
  });

  it('should turn a human draft back into a standard one and keep the pasted prose as an imported revision', async () => {
    const projectId = await seedProject([{ chapter: 1, body: 'Orrin wrote this himself.', revision: 3, generator: 'human', reviewStatus: 'needs_review' }]);

    await regenerate(projectId, 1);

    const [first] = await draftsOf(projectId);
    expect(first).toMatchObject({ body: FULL_LENGTH_DRAFT_BODY, revision: 4, generator: 'standard', isolated: false });
    expect((await revisionsOf(projectId))[0]).toEqual({ revision: 3, source: 'imported', body: 'Orrin wrote this himself.' });
  });

  it('should lift an isolated unrestricted draft out of isolation without losing its prose', async () => {
    const projectId = await seedProject([{ chapter: 1, body: 'The firewalled scene.', revision: 2, generator: 'unrestricted', isolated: true, reviewStatus: 'needs_review' }]);

    await regenerate(projectId, 1);

    const [first] = await draftsOf(projectId);
    expect(first).toMatchObject({ body: FULL_LENGTH_DRAFT_BODY, revision: 3, generator: 'standard', isolated: false });
    expect((await revisionsOf(projectId))[0]).toEqual({ revision: 2, source: 'generated', body: 'The firewalled scene.' });
  });

  it('should keep a later draft’s more specific stale reason and say "drafted" when there was no prior draft', async () => {
    const projectId = await seedProject([
      { chapter: 2, body: 'From the tower, Orrin saw the tide.', staleReason: 'ancestor chapter 1 was revised' },
      { chapter: 3, body: 'The tide came in.' },
    ]);

    await regenerate(projectId, 1);

    const [, second, third] = await draftsOf(projectId);
    expect(second?.staleReason).toBe('ancestor chapter 1 was revised');
    expect(third?.staleReason).toBe('ancestor chapter 1 was drafted');
  });
});
