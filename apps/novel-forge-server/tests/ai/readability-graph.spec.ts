import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
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
const dbName = `${baseConnectionString.split('/').pop()}_readability_graph`;

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

const ORNATE_BODY = Array.from(
  { length: 66 },
  (_, i) => `At bell ${i + 1} Pell spoke in a voice like a hinge nobody oiled. The kitchen held its breath. She walked to the door and opened it for the courier.`,
).join('\n\n');

const ISSUE = '"The kitchen held its breath." — metaphor for a room; show it: "Nobody in the kitchen spoke."';
const COMPLIANT = { verdict: 'consistent', findings: [], briefCompliance: { compliant: true, issues: [] }, readabilityCompliance: { compliant: true, issues: [] } };
const UNREADABLE = { ...COMPLIANT, readabilityCompliance: { compliant: false, issues: [ISSUE] } };

interface RunResult {
  outcome: string | null;
  reviewStatus: string | undefined;
  judgeNote: string | null | undefined;
  judgePrompts: string[];
  fixFindings: string[];
}

describe.if(pgAvailable)('readability gate in chapter generation', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function run(body: string, judgeReplies: unknown[], autoFix: boolean): Promise<RunResult> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `readability-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');

    const fixFindings: string[] = [];
    const judgePrompts: string[] = [];
    const modelRouter = {
      structured: async (promptModule: { key: string }, vars: Record<string, unknown>) => {
        if (promptModule.key === 'generation') return { title: 'Chapter Title', body, summary: 'A summary.', state: {} };
        if (promptModule.key === 'fix') {
          fixFindings.push(String(vars['findings']));
          return { action: 'rewrite' };
        }
        return { title: 'Chapter Title' };
      },
      chatFor: () => ({
        bindTools: () => ({
          invoke: async (messages: BaseMessage[]) => {
            judgePrompts.push(String(messages.filter(m => m.getType() === 'human').pop()?.content));
            return new AIMessage(JSON.stringify(judgeReplies[Math.min(judgePrompts.length - 1, judgeReplies.length - 1)]));
          },
        }),
      }),
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

    const graph = createChapterGenerationGraph(services);
    const runId = `readability-${project.id}`;
    const input = { projectId: String(project.id), chapter: 1, volumeKey: '', guidance: '', autoFix, maxFixes: 1, runId };
    const state = (await graph.invoke(input, { configurable: { thread_id: runId } })) as { outcome: string | null };
    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, project.id), eq(schema.drafts.chapter, 1)) });
    return { outcome: state.outcome, reviewStatus: draft?.reviewStatus, judgeNote: draft?.judgeNote, judgePrompts, fixFindings };
  }

  it('should accept plain prose the judge reads as plain, with nothing in the judge note', async () => {
    const { outcome, judgeNote, judgePrompts } = await run(FULL_LENGTH_DRAFT_BODY, [COMPLIANT], true);

    expect(outcome).toBe('accepted');
    expect(judgeNote).toBeNull();
    expect(judgePrompts[0]).toContain('## READABILITY EVIDENCE\n');
    expect(judgePrompts[0]).toContain("Over the default's limits: none");
  });

  it('should hand the judge the measurements and flagged sentences, and not repair when the judge finds the prose fine', async () => {
    const { outcome, reviewStatus, judgeNote, judgePrompts, fixFindings } = await run(ORNATE_BODY, [COMPLIANT], true);

    expect(outcome).toBe('accepted');
    expect(reviewStatus).toBe('needs_review');
    expect(fixFindings).toEqual([]);
    expect(judgePrompts[0]).toContain('ornate constructions');
    expect(judgePrompts[0]).toContain('1. "At bell 1 Pell spoke in a voice like a hinge nobody oiled." (metaphor for a voice)');
    expect(judgePrompts[0]).toContain("the project's writing-style additions win where they allow this prose");
    expect(judgeNote).toStartWith('[info] readability: measured 1914 words');
    expect(judgeNote).toContain("over the default's limits: ornate constructions");
  });

  it('should repair a draft the judge finds unreadable and accept the fixed one', async () => {
    const { outcome, fixFindings, judgeNote } = await run(FULL_LENGTH_DRAFT_BODY, [UNREADABLE, COMPLIANT], true);

    expect(outcome).toBe('accepted');
    expect(fixFindings).toHaveLength(1);
    expect(fixFindings[0]).toContain(`[soft] readability: ${ISSUE}`);
    expect(judgeNote).toBeNull();
  });

  it('should accept a readability-only miss for normal review once the repair budget is spent', async () => {
    const { outcome, reviewStatus, fixFindings, judgeNote } = await run(FULL_LENGTH_DRAFT_BODY, [UNREADABLE], true);

    expect(fixFindings).toHaveLength(1);
    expect(outcome).toBe('accepted');
    expect(reviewStatus).toBe('needs_review');
    expect(judgeNote).toContain(`[soft] readability: ${ISSUE}`);
  });

  it('should accept a readability-only miss for normal review when autoFix is off', async () => {
    const { outcome, reviewStatus, fixFindings, judgeNote } = await run(FULL_LENGTH_DRAFT_BODY, [UNREADABLE], false);

    expect(fixFindings).toEqual([]);
    expect(outcome).toBe('accepted');
    expect(reviewStatus).toBe('needs_review');
    expect(judgeNote).toContain(`[soft] readability: ${ISSUE}`);
  });

  it('should still hold a draft for review when readability misses alongside another failure', async () => {
    const judgeReply = { ...UNREADABLE, briefCompliance: { compliant: false, issues: ['the bribe never happens on-page'] } };
    const { outcome, reviewStatus } = await run(FULL_LENGTH_DRAFT_BODY, [judgeReply], false);

    expect(outcome).toBe('awaiting_review');
    expect(reviewStatus).toBe('contradiction');
  });

  it('should treat a non-compliant readability verdict with no issues as compliant', async () => {
    const { outcome, fixFindings } = await run(FULL_LENGTH_DRAFT_BODY, [{ ...COMPLIANT, readabilityCompliance: { compliant: false, issues: [] } }], true);

    expect(outcome).toBe('accepted');
    expect(fixFindings).toEqual([]);
  });

  it('should not hold a draft back when the judge leaves readability out', async () => {
    const { outcome } = await run(FULL_LENGTH_DRAFT_BODY, [{ verdict: 'consistent', findings: [], briefCompliance: { compliant: true, issues: [] } }], false);
    expect(outcome).toBe('accepted');
  });
});
