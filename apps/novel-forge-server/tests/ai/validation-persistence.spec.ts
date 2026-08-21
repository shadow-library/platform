import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { createNovelValidationGraph } from '@modules/ai/graphs/novel-validation.graph';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_validation_persist`;

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

interface WindowVerdict {
  fail?: boolean;
  issues?: { chapter?: number; severity: 'error' | 'warning'; category: string; description: string }[];
  summary?: string;
}

function windowFrom(content: unknown): { from: number; to: number } {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const match = text.match(/chapters \((\d+)-(\d+)\)/);
  return { from: match ? Number(match[1]) : 0, to: match ? Number(match[2]) : 0 };
}

function buildServices(db: PrimaryDatabase, checkpointer: PostgresSaver, verdicts: Record<string, WindowVerdict>) {
  return {
    db,
    contextAssembler: { forValidationWindow: async () => ({ rendered: 'context' }) },
    modelRouter: {
      chatFor: () => ({
        invoke: async (messages: BaseMessage[]) => {
          const human = [...messages].reverse().find(m => m._getType() === 'human');
          const { from, to } = windowFrom(human?.content);
          const verdict = verdicts[`${from}-${to}`];
          if (!verdict || verdict.fail) throw new Error(`mock llm failure for window ${from}-${to}`);
          return new AIMessage({ content: JSON.stringify({ issues: verdict.issues ?? [], summary: verdict.summary ?? 'clean' }) });
        },
      }),
    },
    telemetry: {},
    toolRegistry: { forNode: () => [], getRaw: () => [] },
    indexingService: {},
    checkpointer,
  } as never;
}

describe.if(pgAvailable)('novel-validation persistReport', () => {
  let db: PrimaryDatabase;

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());
  let checkpointer: PostgresSaver;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    checkpointer = PostgresSaver.fromConnString(url);
  });

  it('writes a validation_reports row for the run (no chapters → no LLM calls)', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `val-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');

    // With no finalized chapters, planWindows yields no windows, so validateWindows never calls a model.
    const services = { db, contextAssembler: {}, modelRouter: {}, telemetry: {}, toolRegistry: {}, indexingService: {}, checkpointer } as never;
    const graph = createNovelValidationGraph(services);

    await graph.invoke({ projectId: String(project.id), runId: 'val-run-1' }, { configurable: { thread_id: 'val-run-1' } });

    const reports = await db.query.validationReports.findMany({ where: eq(schema.validationReports.projectId, project.id) });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.scope).toBe('novel');
    expect(reports[0]?.issues).toBe(0);
  });

  async function seedProject(
    name: string,
    chapterSpecs: { number: number; needsRevalidation: boolean }[],
    volumeSpecs: { volumeKey: string; ordinal: number; startChapter: number; endChapter: number }[],
  ) {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `${name}-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');

    await db.insert(schema.chapters).values(chapterSpecs.map(c => ({ projectId: project.id, number: c.number, status: 'done' as const, needsRevalidation: c.needsRevalidation })));
    if (volumeSpecs.length > 0) {
      await db
        .insert(schema.volumes)
        .values(volumeSpecs.map(v => ({ projectId: project.id, volumeKey: v.volumeKey, ordinal: v.ordinal, startChapter: v.startChapter, endChapter: v.endChapter })));
    }
    return project;
  }

  async function needsRevalidationFor(projectId: bigint, number: number): Promise<boolean | undefined> {
    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, number)) });
    return chapter?.needsRevalidation;
  }

  it('should report failed windows as uncovered', async () => {
    const project = await seedProject(
      'val-coverage',
      [
        { number: 1, needsRevalidation: false },
        { number: 2, needsRevalidation: false },
        { number: 3, needsRevalidation: false },
        { number: 4, needsRevalidation: false },
      ],
      [
        { volumeKey: 'vol-a', ordinal: 1, startChapter: 1, endChapter: 2 },
        { volumeKey: 'vol-b', ordinal: 2, startChapter: 3, endChapter: 4 },
      ],
    );

    const services = buildServices(db, checkpointer, { '3-4': { issues: [], summary: 'window b clean' } });
    const graph = createNovelValidationGraph(services);
    const runId = `val-run-cov-${project.id}`;
    await graph.invoke({ projectId: String(project.id), runId }, { configurable: { thread_id: runId } });

    const report = await db.query.validationReports.findFirst({ where: eq(schema.validationReports.projectId, project.id) });
    const payload = report?.payload as { windowsRequested: number; windowsSucceeded: number; failedRanges: { from: number; to: number }[] };
    expect(payload.windowsRequested).toBe(2);
    expect(payload.windowsSucceeded).toBe(1);
    expect(payload.failedRanges).toEqual([{ from: 1, to: 2 }]);
  });

  it('should not clear needsRevalidation outside covered windows', async () => {
    const project = await seedProject(
      'val-uncovered',
      [
        { number: 1, needsRevalidation: false },
        { number: 2, needsRevalidation: false },
        { number: 5, needsRevalidation: true },
      ],
      [{ volumeKey: 'vol-a', ordinal: 1, startChapter: 1, endChapter: 2 }],
    );

    const services = buildServices(db, checkpointer, { '1-2': { issues: [], summary: 'window a clean' } });
    const graph = createNovelValidationGraph(services);
    const runId = `val-run-uncov-${project.id}`;
    await graph.invoke({ projectId: String(project.id), runId }, { configurable: { thread_id: runId } });

    expect(await needsRevalidationFor(project.id, 1)).toBe(false);
    expect(await needsRevalidationFor(project.id, 2)).toBe(false);
    expect(await needsRevalidationFor(project.id, 5)).toBe(true);
  });

  it('should preserve flags set by refinement when a window fails', async () => {
    const project = await seedProject(
      'val-preserve',
      [
        { number: 1, needsRevalidation: true },
        { number: 2, needsRevalidation: true },
        { number: 3, needsRevalidation: false },
        { number: 4, needsRevalidation: false },
      ],
      [
        { volumeKey: 'vol-a', ordinal: 1, startChapter: 1, endChapter: 2 },
        { volumeKey: 'vol-b', ordinal: 2, startChapter: 3, endChapter: 4 },
      ],
    );

    const services = buildServices(db, checkpointer, {
      '3-4': { issues: [{ chapter: 4, severity: 'error', category: 'continuity', description: 'timeline conflict' }], summary: 'window b found an issue' },
    });
    const graph = createNovelValidationGraph(services);
    const runId = `val-run-preserve-${project.id}`;
    await graph.invoke({ projectId: String(project.id), runId }, { configurable: { thread_id: runId } });

    expect(await needsRevalidationFor(project.id, 1)).toBe(true);
    expect(await needsRevalidationFor(project.id, 2)).toBe(true);
    expect(await needsRevalidationFor(project.id, 3)).toBe(false);
    expect(await needsRevalidationFor(project.id, 4)).toBe(true);
  });
});
