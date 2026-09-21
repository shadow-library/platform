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
const dbName = `${baseConnectionString.split('/').pop()}_knowledge_leak_repair`;

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

const SECRET_TEXT = 'The lighthouse keeper is secretly the smuggler’s sister.';
const AUTHOR_NOTE = 'Guards the sister reveal in chapter 10.';
const WRITER_NOTE = 'Whenever the keeper is asked about the smuggler, she changes the subject.';
const LEAKY_BODY = `${FULL_LENGTH_DRAFT_BODY}\n\nThe keeper admitted she was his sister.`;
const JUDGE_ISSUE = `[keeper_is_sister] the draft states outright that ${SECRET_TEXT}`;

describe.if(pgAvailable)('knowledge-leak findings in the repair prompts', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(writerNote: string | null): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `leak-repair-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.entities).values({ projectId: project.id, entityKey: 'keeper', type: 'character', name: 'Keeper' });
    await db
      .insert(schema.canonFacts)
      .values({ projectId: project.id, factKey: 'keeper_is_sister', text: SECRET_TEXT, constraintNote: AUTHOR_NOTE, writerNote, terms: ['sister'], revealChapter: 10 });
    await db.insert(schema.briefs).values({
      projectId: project.id,
      chapter: 1,
      body: 'The keeper tends the lamp.',
      knowledgeContract: { pov: ['keeper'], learns: [] },
      endingContract: { hookType: 'turn', emotionalBeat: 'unease', openQuestion: 'who signals?', handoffState: 'fog rolls in', mustNotResolve: ['fact:keeper_is_sister'] },
    });
    return project.id;
  }

  async function runRepair(
    writerNote: string | null,
    guidance = '',
    judgeExtras: Record<string, unknown> = {},
  ): Promise<{ writerPrompts: string[]; endingContracts: string[]; judgeNote: string | null | undefined }> {
    const projectId = await seedProject(writerNote);
    const writerPrompts: string[] = [];
    const endingContracts: string[] = [];
    const modelRouter = {
      structured: async (promptModule: { key: string }, vars: Record<string, unknown>) => {
        if (promptModule.key === 'generation') {
          endingContracts.push(String(vars['endingContract']));
          if (vars['guidance']) writerPrompts.push(String(vars['guidance']));
          return { title: 'Chapter Title', body: LEAKY_BODY, summary: 'A summary.', state: {} };
        }
        if (promptModule.key === 'fix') {
          writerPrompts.push(String(vars['findings']));
          return { action: 'rewrite' };
        }
        return { title: 'Chapter Title' };
      },
      chatFor: () => ({
        bindTools: () => ({
          invoke: async () =>
            new AIMessage(
              JSON.stringify({
                verdict: 'consistent',
                findings: [],
                briefCompliance: { compliant: true, issues: [] },
                knowledgeCompliance: { compliant: false, issues: [JUDGE_ISSUE] },
                ...judgeExtras,
              }),
            ),
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
    const runId = `leak-${projectId}`;
    await graph.invoke({ projectId: String(projectId), chapter: 1, volumeKey: '', guidance, autoFix: true, maxFixes: 1, runId }, { configurable: { thread_id: runId } });
    const draft = await db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, 1)) });
    return { writerPrompts, endingContracts, judgeNote: draft?.judgeNote };
  }

  it('should hand the fixer and the rewriter only the term to cut and the writer note', async () => {
    const { writerPrompts, judgeNote } = await runRepair(WRITER_NOTE);

    expect(writerPrompts.length).toBeGreaterThanOrEqual(2);
    for (const prompt of writerPrompts) {
      expect(prompt).not.toContain('keeper_is_sister');
      expect(prompt).not.toContain(SECRET_TEXT);
      expect(prompt).not.toContain(AUTHOR_NOTE);
      expect(prompt).toContain('remove or avoid "sister"');
      expect(prompt).toContain(WRITER_NOTE);
    }
    expect(judgeNote).toContain('keeper_is_sister');
  });

  it('should show the writer a fact in mustNotResolve only through its writer note', async () => {
    const { endingContracts } = await runRepair(WRITER_NOTE);

    expect(endingContracts.length).toBeGreaterThanOrEqual(2);
    for (const contract of endingContracts) {
      expect(contract).not.toContain('keeper_is_sister');
      expect(contract).toContain(`Must NOT resolve: ${WRITER_NOTE}`);
    }
  });

  it('should scrub a hidden key or text out of every other finding before it reaches the fixer', async () => {
    const { writerPrompts } = await runRepair(WRITER_NOTE, '', {
      endingCompliance: { compliant: false, issues: ['resolves mustNotResolve entry fact:keeper_is_sister'] },
      findings: [{ severity: 'soft', text: `the narration all but says ${SECRET_TEXT}` }],
    });

    expect(writerPrompts.length).toBeGreaterThanOrEqual(2);
    for (const prompt of writerPrompts) {
      expect(prompt).toContain('ending contract: resolves mustNotResolve entry [withheld]');
      expect(prompt).not.toContain('keeper_is_sister');
      expect(prompt).not.toContain(SECRET_TEXT);
      expect(prompt).toContain(`remove or avoid "sister" — ${WRITER_NOTE}`);
    }
  });

  it('should scrub the secret out of author guidance before the writer sees it', async () => {
    const { writerPrompts } = await runRepair(WRITER_NOTE, `Play up the storm. Remember: ${SECRET_TEXT}`);

    const guided = writerPrompts.filter(prompt => prompt.includes('Play up the storm.'));
    expect(guided.length).toBeGreaterThanOrEqual(1);
    for (const prompt of guided) expect(prompt).not.toContain(SECRET_TEXT);
  });

  it('should give a generic instruction when the leaked fact has no writer note', async () => {
    const { writerPrompts } = await runRepair(null);

    for (const prompt of writerPrompts) {
      expect(prompt).not.toContain('keeper_is_sister');
      expect(prompt).not.toContain(SECRET_TEXT);
      expect(prompt).toContain('cut anything that states or implies what the POV cast cannot know yet');
    }
  });
});
