import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ReforgeAnalysisService } from '@modules/reforge/reforge-analysis.service';
import { ReforgeService } from '@modules/reforge/reforge.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

interface ScriptedCall {
  key: string;
  vars: Record<string, unknown>;
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_reforge_analysis`;

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

const CHAPTER_COUNT = 40;
const WINDOW_SIZE = 10;

function windowOutput(from: number, to: number): unknown {
  const cards = [];
  for (let chapter = from; chapter <= to; chapter++) {
    cards.push({ chapter, summary: `chapter ${chapter} happens`, movement: chapter % 5 === 0 ? 'stalls' : 'advances', cast: ['Evan'] });
  }
  return {
    cards,
    findings: [{ type: 'filler', fromChapter: from, toChapter: to, severity: 3, confidence: 0.8, label: `filler across ${from}-${to}` }],
    carryState: { storySoFar: `the story stands at chapter ${to}`, openThreads: ['the tribunal'] },
  };
}

const synthesisOutput = {
  summary: 'A 40-chapter serial whose middle repeats itself.',
  pacingProfile: 'front-loaded, then flat',
  arcs: [
    { fromChapter: 1, toChapter: 20, label: 'The Sect Years' },
    { fromChapter: 21, toChapter: 40, label: 'The Ash Court' },
  ],
  findings: [{ type: 'dead_subplot', fromChapter: 5, toChapter: 12, severity: 4, confidence: 0.6, label: 'the tribunal subplot is abandoned' }],
};

function buildService(db: PrimaryDatabase, calls: ScriptedCall[], failWindows: number[] = []): ReforgeAnalysisService {
  const databaseService = { getPostgresClient: () => db } as never;
  let window = 0;

  const modelRouter = {
    structured: async (prompt: { key: string }, vars: Record<string, unknown>) => {
      calls.push({ key: prompt.key, vars });
      if (prompt.key === 'reforge-synthesize') return synthesisOutput;
      window++;
      if (failWindows.includes(window)) throw new Error(`window ${window} exploded`);
      const [from, to] = String(vars['windowLabel']).split('-').map(Number);
      return windowOutput(from as number, to as number);
    },
  } as never;

  const contextAssembler = {
    forReforgeAnalysis: async (_projectId: bigint, _window: number | null, input: Record<string, unknown>) => {
      calls.push({ key: 'context:reforge_analysis', vars: input });
      return { id: null, rendered: 'PACK', renderedStable: 'STABLE-WORLD-NOTES', renderedVolatile: 'VOLATILE' };
    },
  } as never;

  const workflowRunService = {
    runChain: async (_projectId: bigint, _graph: string, _target: string, _input: unknown, fn: (runId: string) => Promise<unknown>) => {
      const runId = randomUUID();
      return { runId, result: await fn(runId) };
    },
    linkContextPack: async () => undefined,
  } as never;

  return new ReforgeAnalysisService(databaseService, new ReforgeService(databaseService), contextAssembler, modelRouter, workflowRunService);
}

describe.if(pgAvailable)('ReforgeAnalysisService', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(name: string, analysisWindow: number = WINDOW_SIZE): Promise<bigint> {
    const [project] = await db.insert(schema.projects).values({ name, kind: 'source' }).returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.reforges).values({ projectId: project.id, mode: 'transform', settings: { analysisWindow } });
    await db.insert(schema.chapters).values(
      Array.from({ length: CHAPTER_COUNT }, (_, index) => ({
        projectId: project.id,
        number: index + 1,
        title: `Chapter ${index + 1}`,
        content: `Evan crossed the ${index % 4 === 0 ? 'bridge' : 'courtyard'} while the bells rang. "We ride at dawn," he said.\n\nThe ward held.`,
        wordCount: 2000,
        status: 'done' as const,
      })),
    );
    return project.id;
  }

  it('should run signals, then serial windows carrying state forward, then synthesis', async () => {
    const projectId = await seedProject(`analysis-happy-${Date.now()}`);
    const calls: ScriptedCall[] = [];

    const result = await buildService(db, calls).analyze(projectId);

    expect(result).toMatchObject({ chaptersAnalyzed: CHAPTER_COUNT, windowsFailed: 0 });
    const windowCalls = calls.filter(c => c.key === 'reforge-analyze-window');
    expect(windowCalls.map(c => c.vars['windowLabel'])).toEqual(['1-10', '11-20', '21-30', '31-40']);
    expect(calls.filter(c => c.key === 'reforge-synthesize')).toHaveLength(1);

    // The first window opens with no carry state; every later one opens with its predecessor's.
    const packs = calls.filter(c => c.key === 'context:reforge_analysis');
    expect(packs[0]?.vars['carryState']).toBeNull();
    expect(packs[1]?.vars['carryState']).toContain('the story stands at chapter 10');

    const analysis = await db.query.reforgeAnalyses.findFirst({ where: eq(schema.reforgeAnalyses.projectId, projectId) });
    expect(analysis).toMatchObject({ status: 'done', windowSize: WINDOW_SIZE, chaptersAnalyzed: CHAPTER_COUNT, windowsFailed: 0 });
    expect(analysis?.metrics).toMatchObject({ arcCount: 2, stallRatio: 0.2 });
    expect(analysis?.runIds).toHaveLength(5);
    expect(analysis?.report).toContain('# Source analysis');
    expect(analysis?.report).toContain('The Sect Years');

    const cards = await db.query.reforgeChapterCards.findMany({
      where: eq(schema.reforgeChapterCards.analysisId, analysis!.id),
      orderBy: [asc(schema.reforgeChapterCards.chapter)],
    });
    expect(cards).toHaveLength(CHAPTER_COUNT);
    expect(cards[4]).toMatchObject({ chapter: 5, movement: 'stalls' });
  });

  it('should record every signal the model never confirmed alongside the model findings', async () => {
    const projectId = await seedProject(`analysis-findings-${Date.now()}`);

    await buildService(db, []).analyze(projectId);
    const analysis = await db.query.reforgeAnalyses.findFirst({ where: eq(schema.reforgeAnalyses.projectId, projectId) });
    const findings = await db.query.reforgeFindings.findMany({ where: eq(schema.reforgeFindings.analysisId, analysis!.id) });

    const bySource = findings.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.detectedBy]: (acc[f.detectedBy] ?? 0) + 1 }), {});
    // Four window findings plus one from synthesis, none of which cited a signal id.
    expect(bySource['model']).toBe(5);
    expect(findings.some(f => f.type === 'dead_subplot' && f.fromChapter === 5)).toBe(true);
    // The signal-only candidates the reading pass never mentioned still survive into the report.
    expect(bySource['signal']).toBeGreaterThan(0);
    expect(findings.filter(f => f.detectedBy === 'signal').every(f => f.confidence < 1)).toBe(true);
  });

  it('should flag a failed window and continue the chain from the last good carry state', async () => {
    const projectId = await seedProject(`analysis-window-fail-${Date.now()}`, 2);
    const calls: ScriptedCall[] = [];

    const result = await buildService(db, calls, [5]).analyze(projectId);

    expect(result.windowsFailed).toBe(1);
    expect(result.chaptersAnalyzed).toBe(CHAPTER_COUNT - 2);
    const packs = calls.filter(c => c.key === 'context:reforge_analysis');
    // Window 6 opens on window 4's carry state — the failed window contributed nothing to forget.
    expect(packs[5]?.vars['carryState']).toContain('the story stands at chapter 8');

    const analysis = await db.query.reforgeAnalyses.findFirst({ where: eq(schema.reforgeAnalyses.projectId, projectId) });
    expect(analysis?.status).toBe('done');
    const findings = await db.query.reforgeFindings.findMany({ where: eq(schema.reforgeFindings.analysisId, analysis!.id) });
    expect(findings).toContainEqual(expect.objectContaining({ type: 'window_failed', fromChapter: 9, toChapter: 10, detail: 'window 5 exploded' }));
  });

  it('should abort rather than draw a plan from a holed report when too many windows fail', async () => {
    const projectId = await seedProject(`analysis-abort-${Date.now()}`);

    await expect(buildService(db, [], [1, 2]).analyze(projectId)).rejects.toThrow(/2 of 4 windows failed/);

    const analysis = await db.query.reforgeAnalyses.findFirst({ where: eq(schema.reforgeAnalyses.projectId, projectId) });
    expect(analysis).toMatchObject({ status: 'failed', windowsFailed: 2 });
    expect(analysis?.lastError).toContain('2 of 4 analysis windows failed');
  });

  it('should 404 the analysis reads until a run has landed', async () => {
    const projectId = await seedProject(`analysis-404-${Date.now()}`);
    const service = buildService(db, []);

    await expect(service.status(projectId)).rejects.toMatchObject({ code: 'REF_004' });

    await service.analyze(projectId);
    const status = await service.status(projectId);
    expect(status.findingCounts['filler']).toBeGreaterThan(0);
    expect(await service.report(projectId)).toContain('## Findings');

    const filler = await service.listFindings(projectId, { type: 'filler' });
    expect(filler.items.every(f => f.type === 'filler')).toBe(true);
    expect(filler.total).toBe(filler.items.length);
    const severe = await service.listFindings(projectId, { minSeverity: 4 });
    expect(severe.items.every(f => f.severity >= 4)).toBe(true);
  });
});
