import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterGenerationGraph } from '@modules/ai/graphs/chapter-generation.graph';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginPolicy } from '@tests/fixtures/plugin-policy';
import { FULL_LENGTH_DRAFT_BODY } from '@tests/fixtures/draft-body';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_mechanical_check`;

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

// ~2,800 words: over the 1,800–2,600 target band but well inside the hard ceiling, so soft-only.
const SOFT_BODY = `${FULL_LENGTH_DRAFT_BODY} ${'She waited by the wall and counted the lamps again. '.repeat(100)}`.trim();

function buildServices(db: PrimaryDatabase, body: string, expandedBody?: string) {
  const modelRouter = {
    structured: async (promptModule: { key: string }) => {
      if (promptModule.key === 'generation') return { title: 'Chapter Title', body, summary: 'A summary.', state: {} };
      if (promptModule.key === 'chapter-expand' && expandedBody) return { body: expandedBody };
      return { title: 'Chapter Title' };
    },
    chatFor: () => ({
      bindTools: () => ({
        invoke: async () => new AIMessage(JSON.stringify({ verdict: 'consistent', findings: [], briefCompliance: { compliant: true, issues: [] } })),
      }),
    }),
    resolveModel: () => ({ provider: 'test', model: 'test' }),
    resolveFor: async () => ({ provider: 'test', model: 'test' }),
  };

  const contextAssembler = { forChapter: async () => ({ id: null }) };
  const toolRegistry = { forNode: () => [], getRaw: () => [] };

  return {
    db,
    contextAssembler,
    modelRouter,
    telemetry: {},
    toolRegistry,
    indexingService: {},
    pluginPolicy: noPluginPolicy(),
    checkpointer: new MemorySaver(),
  } as never;
}

describe.if(pgAvailable)('mechanical check node', () => {
  let db: PrimaryDatabase;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  async function seedProject(wordTarget?: { min: number; max: number }): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({
        name: `mechanical-check-${Date.now()}-${Math.random()}`,
        kind: 'new_novel',
        wordTargetMin: wordTarget?.min,
        wordTargetMax: wordTarget?.max,
      })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  async function run(
    body: string,
    autoFix: boolean,
    wordTarget?: { min: number; max: number },
  ): Promise<{ outcome: string | null; mechanicallyCompliant: boolean; projectId: bigint }> {
    const projectId = await seedProject(wordTarget);
    const graph = createChapterGenerationGraph(buildServices(db, body));
    const runId = `mechanical-${projectId}-${autoFix}`;
    const input = { projectId: String(projectId), chapter: 1, volumeKey: '', guidance: '', autoFix, maxFixes: 0, runId };
    const finalState = (await graph.invoke(input, { configurable: { thread_id: runId } })) as { outcome: string | null; mechanicallyCompliant: boolean };
    return { ...finalState, projectId };
  }

  it('should block acceptance when a hard mechanical finding contradicts a consistent judge verdict', async () => {
    const { outcome, mechanicallyCompliant, projectId } = await run('A single short line of prose.', false);

    expect(mechanicallyCompliant).toBe(false);
    expect(outcome).toBe('awaiting_review');

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.judge).toBe('consistent');
    expect(draft?.reviewStatus).toBe('contradiction');
    expect(draft?.judgeNote).toContain('[hard] mechanical:');
  });

  it('should route a hard mechanical finding into the repair ladder when autoFix is on', async () => {
    const { outcome } = await run('A single short line of prose.', true);
    expect(outcome).toBe('accepted_with_findings');
  });

  it('should accept a draft whose only mechanical findings are soft, and still record them for review', async () => {
    const { outcome, mechanicallyCompliant, projectId } = await run(SOFT_BODY, false);

    expect(mechanicallyCompliant).toBe(true);
    expect(outcome).toBe('accepted');

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.reviewStatus).toBe('needs_review');
    expect(draft?.judgeNote).toContain('[soft] mechanical:');
  });

  it('should accept a clean draft with no mechanical findings at all', async () => {
    const { outcome, mechanicallyCompliant, projectId } = await run(FULL_LENGTH_DRAFT_BODY, false);

    expect(mechanicallyCompliant).toBe(true);
    expect(outcome).toBe('accepted');

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.judgeNote).toBeNull();
  });

  it('should persist the expanded prose when the first draft lands under the target band', async () => {
    const projectId = await seedProject();
    const short = FULL_LENGTH_DRAFT_BODY.split(' ').slice(0, 1400).join(' ');
    const graph = createChapterGenerationGraph(buildServices(db, short, FULL_LENGTH_DRAFT_BODY));
    const runId = `mechanical-expand-${projectId}`;
    const finalState = (await graph.invoke(
      { projectId: String(projectId), chapter: 1, volumeKey: '', guidance: '', autoFix: false, maxFixes: 0, runId },
      { configurable: { thread_id: runId } },
    )) as { outcome: string | null };

    expect(finalState.outcome).toBe('accepted');
    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.body).toBe(FULL_LENGTH_DRAFT_BODY);
    expect(draft?.judgeNote).toBeNull();
  });

  it('should check a soft-target-band finding against the project’s overridden word target, not the application default', async () => {
    // ~1,900 words — inside the 1,800–2,600 default band (see the other "accept a clean draft" case
    // above), but under the floor of a project overridden to 2,000–3,500.
    const { outcome, mechanicallyCompliant, projectId } = await run(FULL_LENGTH_DRAFT_BODY, false, { min: 2000, max: 3500 });

    expect(mechanicallyCompliant).toBe(true);
    expect(outcome).toBe('accepted');

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.judgeNote).toContain('under the 2000–3500 target band');
  });

  it('should compare the draft against the last finished chapters', async () => {
    const projectId = await seedProject();
    await db.insert(schema.chapters).values({ projectId, number: 1, title: 'Prior', content: FULL_LENGTH_DRAFT_BODY, status: 'done' });

    const graph = createChapterGenerationGraph(buildServices(db, FULL_LENGTH_DRAFT_BODY));
    const runId = `mechanical-prior-${projectId}`;
    await graph.invoke({ projectId: String(projectId), chapter: 2, volumeKey: '', guidance: '', autoFix: false, maxFixes: 0, runId }, { configurable: { thread_id: runId } });

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 2)) });
    expect(draft?.judgeNote).toContain('also appear in the previous 1 chapter(s)');
  });
});
