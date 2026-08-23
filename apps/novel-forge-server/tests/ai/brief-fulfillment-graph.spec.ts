import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterGenerationGraph } from '@modules/ai/graphs/chapter-generation.graph';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { FULL_LENGTH_DRAFT_BODY } from '@tests/fixtures/draft-body';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_brief_fulfillment`;

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

const BRIEF_BODY = 'Objective: Li Wei bribes the harbormaster for the manifest.\n\nEvents:\n1. He reaches the harbor office.\n2. He offers the bribe.\n3. He reads the manifest.';

function buildServices(db: PrimaryDatabase, judgeReply: unknown, seenMessages: BaseMessage[][]) {
  const modelRouter = {
    structured: async (promptModule: { key: string }) => {
      if (promptModule.key === 'generation') return { title: 'Chapter Title', body: FULL_LENGTH_DRAFT_BODY, summary: 'A summary.', state: {} };
      if (promptModule.key === 'fix') return { action: 'rewrite', body: FULL_LENGTH_DRAFT_BODY };
      return { title: 'Chapter Title' };
    },
    chatFor: () => ({
      bindTools: () => ({
        invoke: async (messages: BaseMessage[]) => {
          seenMessages.push(messages);
          return new AIMessage(JSON.stringify(judgeReply));
        },
      }),
    }),
    resolveModel: () => ({ provider: 'test', model: 'test' }),
  };

  const contextAssembler = { forChapter: async () => ({ id: null }) };
  const toolRegistry = { forNode: () => [], getRaw: () => [] };

  return { db, contextAssembler, modelRouter, telemetry: {}, toolRegistry, indexingService: {}, checkpointer: new MemorySaver() } as never;
}

describe.if(pgAvailable)('judge brief-fulfillment gate', () => {
  let db: PrimaryDatabase;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  async function seedProject(pov?: string): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `brief-fulfillment-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.briefs).values({ projectId: project.id, chapter: 1, title: 'The Manifest', body: BRIEF_BODY, pov: pov ?? null });
    return project.id;
  }

  async function run(
    judgeReply: unknown,
    autoFix: boolean,
    pov?: string,
  ): Promise<{ outcome: string | null; briefCompliant: boolean; projectId: bigint; seenMessages: BaseMessage[][] }> {
    const projectId = await seedProject(pov);
    const seenMessages: BaseMessage[][] = [];
    const graph = createChapterGenerationGraph(buildServices(db, judgeReply, seenMessages));
    const runId = `brief-${projectId}-${autoFix}`;
    const input = { projectId: String(projectId), chapter: 1, volumeKey: '', guidance: '', autoFix, maxFixes: 0, runId };
    const finalState = (await graph.invoke(input, { configurable: { thread_id: runId } })) as { outcome: string | null; briefCompliant: boolean };
    return { ...finalState, projectId, seenMessages };
  }

  const unfulfilled = {
    verdict: 'consistent',
    findings: [],
    briefCompliance: { compliant: false, issues: ['the bribe is never dramatized', 'the manifest is never read on-page'] },
  };

  it('should block acceptance when the draft fulfills nothing of its brief despite a consistent verdict', async () => {
    const { outcome, briefCompliant, projectId } = await run(unfulfilled, false);

    expect(briefCompliant).toBe(false);
    expect(outcome).toBe('awaiting_review');

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.judge).toBe('consistent');
    expect(draft?.reviewStatus).toBe('contradiction');
    expect(draft?.judgeNote).toContain('[soft] brief: the bribe is never dramatized');
    expect(draft?.judgeNote).toContain('[soft] brief: the manifest is never read on-page');
  });

  it('should route an unfulfilled brief into the repair ladder when autoFix is on', async () => {
    const { outcome } = await run(unfulfilled, true);
    expect(outcome).toBe('accepted_with_findings');
  });

  it('should accept a draft the judge reports as fulfilling its brief', async () => {
    const { outcome, briefCompliant, projectId } = await run({ verdict: 'consistent', findings: [], briefCompliance: { compliant: true, issues: [] } }, false);

    expect(briefCompliant).toBe(true);
    expect(outcome).toBe('accepted');

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.reviewStatus).toBe('needs_review');
    expect(draft?.judgeNote).toBeNull();
  });

  it('should fail closed when the judge omits briefCompliance entirely', async () => {
    const { outcome, briefCompliant, projectId } = await run({ verdict: 'consistent', findings: [] }, false);

    expect(briefCompliant).toBe(false);
    expect(outcome).not.toBe('accepted');
    expect(outcome).toBe('awaiting_review');

    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    expect(draft?.judgeNote).toContain('brief: judge omitted briefCompliance — treated as non-compliant');
  });

  it('should route into the repair ladder when autoFix is on and the judge omits briefCompliance', async () => {
    const { outcome } = await run({ verdict: 'consistent', findings: [] }, true);
    expect(outcome).toBe('accepted_with_findings');
  });

  it('should put the brief body in front of the judge under a ## BRIEF heading', async () => {
    const { seenMessages } = await run({ verdict: 'consistent', findings: [], briefCompliance: { compliant: true, issues: [] } }, false);

    const humanMsg = String(seenMessages[0]?.filter(m => m.getType() === 'human').pop()?.content);
    expect(humanMsg).toContain('## BRIEF');
    expect(humanMsg).toContain('Li Wei bribes the harbormaster for the manifest');
    expect(humanMsg).toContain('briefCompliance');
    expect(humanMsg).not.toContain('POV:');
  });

  it('should name the pov character in the judge brief block when the brief carries one', async () => {
    const { seenMessages } = await run({ verdict: 'consistent', findings: [], briefCompliance: { compliant: true, issues: [] } }, false, 'li-wei');

    const humanMsg = String(seenMessages[0]?.filter(m => m.getType() === 'human').pop()?.content);
    expect(humanMsg).toContain('## BRIEF\nPOV: li-wei\n');
  });
});
