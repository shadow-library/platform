import { randomUUID } from 'node:crypto';

import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { drizzle } from 'drizzle-orm/bun-sql';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { createChapterGenerationGraph } from '@modules/ai/graphs/chapter-generation.graph';
import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_prompt_cache_vars`;

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

const WRITING_STYLE = 'WRITING_STYLE_MARKER — lean, present-tense prose.';
const VOLUME_OBJECTIVE = 'VOLUME_OBJECTIVE_MARKER';
const PREV_ENDING = 'PREV_ENDING_MARKER — the gate slammed shut behind her.';

const draftOutput = { title: 'Ascent', body: 'the rope bit into her palms and the ledge came no closer. '.repeat(4), summary: 'she climbed', state: {} };

interface StructuredCall {
  key: string;
  input: Record<string, unknown>;
}

describe.if(pgAvailable)('generation path prompt-cache vars', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `prompt-cache-vars-${Date.now()}-${Math.random()}`, kind: 'new_novel', instructions: WRITING_STYLE })
      .returning();
    if (!project) throw new Error('failed to seed project');
    const projectId = project.id;

    await db.insert(schema.volumes).values({ projectId, volumeKey: 'vol_1', ordinal: 1, status: 'approved', startChapter: 1, endChapter: 3, objective: VOLUME_OBJECTIVE });
    await db.insert(schema.chapters).values({ projectId, number: 1, title: 'Gate', content: PREV_ENDING, status: 'done', summary: 'she reached the gate' });
    await db.insert(schema.briefs).values({ projectId, chapter: 2, volumeKey: 'vol_1', body: 'CHAPTER_BRIEF_MARKER', handEdited: true });
    return projectId;
  }

  function assembler(): ContextAssembler {
    const databaseService = { getPostgresClient: () => db } as never;
    return new ContextAssembler(databaseService, new CatalogService(databaseService));
  }

  function expectSplitVars(input: Record<string, unknown>): void {
    const stable = String(input['stableContext']);
    const volatileText = String(input['volatileContext']);
    expect(stable).toContain(WRITING_STYLE);
    expect(stable).toContain(VOLUME_OBJECTIVE);
    expect(stable).not.toContain(PREV_ENDING);
    expect(volatileText).toContain(PREV_ENDING);
    expect(volatileText).not.toContain(WRITING_STYLE);
    // The single joined blob must no longer reach the prompt — passing it as the cached var is what
    // defeated the cache on every chapter.
    expect(input['contextPack']).toBeUndefined();
  }

  it('passes the pack stable/volatile segments as separate vars from the graph draft node', async () => {
    const projectId = await seedProject();
    const calls: StructuredCall[] = [];
    const modelRouter = {
      structured: async (promptModule: { key: string }, input: Record<string, unknown>) => {
        calls.push({ key: promptModule.key, input });
        if (promptModule.key === 'generation') return draftOutput;
        return { title: 'Ascent' };
      },
      chatFor: () => ({ bindTools: () => ({ invoke: async () => new AIMessage(JSON.stringify({ verdict: 'consistent', findings: [] })) }) }),
      resolveModel: () => ({ provider: 'test', model: 'test' }),
    };
    const services = {
      db,
      contextAssembler: assembler(),
      modelRouter,
      telemetry: {},
      toolRegistry: { forNode: () => [], getRaw: () => [] },
      checkpointer: new MemorySaver(),
    } as never;

    const runId = randomUUID();
    await createChapterGenerationGraph(services).invoke(
      { projectId: String(projectId), chapter: 2, volumeKey: 'vol_1', guidance: '', autoFix: false, maxFixes: 0, runId },
      { configurable: { thread_id: runId } },
    );

    const generationCall = calls.find(c => c.key === 'generation');
    expect(generationCall).toBeDefined();
    expectSplitVars(generationCall?.input ?? {});
  });

  it('passes the same split vars — and the ending contract — from generateGrok', async () => {
    const projectId = await seedProject();
    const structured = mock(async () => draftOutput);
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;
    const service = new GenerationService(databaseService, noop, { structured } as never, assembler(), noop, noop, noop, noop, noop, noop, noop, noop);

    await service.generateGrok(projectId, 2, { guidance: 'GUIDANCE_MARKER' } as never);

    const [, input] = (structured.mock.calls[0] ?? []) as unknown as [unknown, Record<string, unknown>];
    expectSplitVars(input);
    // The prompt declares endingContract; omitting it made every grok generation throw on render.
    expect(input['endingContract']).toBeDefined();
    expect(input['guidance']).toBe('GUIDANCE_MARKER');
  });
});
