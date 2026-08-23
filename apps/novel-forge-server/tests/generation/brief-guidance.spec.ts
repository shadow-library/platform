import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createChapterGenerationGraph } from '@modules/ai/graphs/chapter-generation.graph';
import { renderChapterBrief } from '@server/common';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { FULL_LENGTH_DRAFT_BODY } from '@tests/fixtures/draft-body';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_brief_guidance`;

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

const BRIEF_BODY = 'Objective: Li Wei bribes the harbormaster for the manifest.\nHe reaches the harbor office.\nHe offers the bribe.';

describe('renderChapterBrief', () => {
  it('should render the stored body byte-identically when the guidance fields are null', () => {
    expect(renderChapterBrief({ body: BRIEF_BODY, chapterPurpose: null, readerValue: null, repetitionRisks: null })).toBe(BRIEF_BODY);
  });

  it('should render the stored body byte-identically when the guidance fields are absent', () => {
    expect(renderChapterBrief({ body: BRIEF_BODY })).toBe(BRIEF_BODY);
  });

  it('should render the stored body byte-identically when the guidance fields are empty', () => {
    expect(renderChapterBrief({ body: BRIEF_BODY, chapterPurpose: '   ', readerValue: [], repetitionRisks: ['', '  '] })).toBe(BRIEF_BODY);
  });

  it('should render an empty string for a missing brief', () => {
    expect(renderChapterBrief(null)).toBe('');
    expect(renderChapterBrief(undefined)).toBe('');
  });

  it('should append the guidance lines in a stable order', () => {
    const rendered = renderChapterBrief({
      body: BRIEF_BODY,
      chapterPurpose: 'Establishes the stakes for the heist.',
      readerValue: ['new_information', 'power_or_stakes_change'],
      repetitionRisks: ['another tavern negotiation', 'another rooftop chase'],
    });

    expect(rendered).toBe(
      `${BRIEF_BODY}\n\nChapter purpose: Establishes the stakes for the heist.\nThis chapter must deliver: new_information, power_or_stakes_change\nAvoid repeating recent patterns: another tavern negotiation; another rooftop chase`,
    );
  });

  it('should include only the fields that carry a value', () => {
    expect(renderChapterBrief({ body: BRIEF_BODY, readerValue: ['emotional_turn'] })).toBe(`${BRIEF_BODY}\n\nThis chapter must deliver: emotional_turn`);
  });

  it('should ignore non-string entries in the jsonb arrays', () => {
    expect(renderChapterBrief({ body: BRIEF_BODY, readerValue: [1, { a: 1 }, 'new_information'] })).toBe(`${BRIEF_BODY}\n\nThis chapter must deliver: new_information`);
  });
});

describe.if(pgAvailable)('chapter generation graph brief guidance', () => {
  let db: PrimaryDatabase;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  function buildServices(seenVars: Record<string, unknown>[]) {
    const modelRouter = {
      structured: async (promptModule: { key: string }, vars: Record<string, unknown>) => {
        if (promptModule.key === 'generation') {
          seenVars.push(vars);
          return { title: 'Chapter Title', body: FULL_LENGTH_DRAFT_BODY, summary: 'A summary.', state: {} };
        }
        return { title: 'Chapter Title' };
      },
      chatFor: () => ({
        bindTools: () => ({
          invoke: async () => new AIMessage(JSON.stringify({ verdict: 'consistent', findings: [], briefCompliance: { compliant: true, issues: [] } })),
        }),
      }),
      resolveModel: () => ({ provider: 'test', model: 'test' }),
    };

    return {
      db,
      contextAssembler: { forChapter: async () => ({ id: null }) },
      modelRouter,
      telemetry: {},
      toolRegistry: { forNode: () => [], getRaw: () => [] },
      indexingService: {},
      checkpointer: new MemorySaver(),
    } as never;
  }

  async function run(brief: Partial<typeof schema.briefs.$inferInsert>): Promise<Record<string, unknown>> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `brief-guidance-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.briefs).values({ projectId: project.id, chapter: 1, title: 'The Manifest', body: BRIEF_BODY, ...brief });

    const seenVars: Record<string, unknown>[] = [];
    const graph = createChapterGenerationGraph(buildServices(seenVars));
    const runId = `brief-guidance-${project.id}`;
    await graph.invoke({ projectId: String(project.id), chapter: 1, volumeKey: '', guidance: '', autoFix: false, maxFixes: 0, runId }, { configurable: { thread_id: runId } });

    const vars = seenVars[0];
    if (!vars) throw new Error('the generation prompt was never rendered');
    return vars;
  }

  it('should pass the stored body unchanged when the brief carries no guidance fields', async () => {
    const vars = await run({});
    expect(vars['chapterBrief']).toBe(BRIEF_BODY);
  });

  it('should pass the guidance lines to the drafter when the brief carries them', async () => {
    const vars = await run({
      chapterPurpose: 'Establishes the stakes for the heist.',
      readerValue: ['new_information'] as never,
      repetitionRisks: ['another tavern negotiation'] as never,
    });

    expect(vars['chapterBrief']).toBe(
      `${BRIEF_BODY}\n\nChapter purpose: Establishes the stakes for the heist.\nThis chapter must deliver: new_information\nAvoid repeating recent patterns: another tavern negotiation`,
    );
  });
});
