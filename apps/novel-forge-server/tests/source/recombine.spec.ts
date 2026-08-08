import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { RecombineService } from '@modules/source';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_recombine`;

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

const FIXTURE = [
  { number: 1, title: 'Chapter 1 - Awakening', content: 'The boy woke.' },
  { number: 2, title: 'Chapter 2 - The Gate (1/2)', content: 'Part one of the gate.' },
  { number: 3, title: 'Chapter 2 - The Gate (2/2)', content: 'Part two of the gate.' },
  { number: 4, title: 'The Road Part 1', content: 'Road part one.' },
  { number: 5, title: 'The Road Part 2', content: 'Road part two.' },
  { number: 6, title: 'Chapter 4 - Dawn', content: 'Dawn broke.' },
];

describe.if(pgAvailable)('RecombineService', () => {
  let db: PrimaryDatabase;
  let service: RecombineService;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    service = buildService();
  });

  // AI collaborators are stubbed: `decisions` scripts the boundary verdicts, `calls` records inputs.
  function buildService(decisions: { afterChapter: number; verdict: string }[] | Error = [], calls: Record<string, unknown>[] = []): RecombineService {
    const modelRouter = {
      structured: async (_prompt: unknown, inputs: Record<string, unknown>) => {
        calls.push(inputs);
        if (decisions instanceof Error) throw decisions;
        return { decisions };
      },
    } as never;
    const workflowRunService = {
      runChain: async (_p: bigint, _g: string, _t: string, _i: unknown, fn: (runId: string) => Promise<unknown>) => ({ runId: 'run-1', result: await fn('run-1') }),
    } as never;
    return new RecombineService({ getPostgresClient: () => db } as never, modelRouter, workflowRunService);
  }

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(options: { kind?: 'source' | 'new_novel'; withChapters?: boolean } = {}): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `recombine-${Date.now()}-${Math.random()}`, kind: options.kind ?? 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    if (options.withChapters ?? true) await db.insert(schema.chapters).values(FIXTURE.map(f => ({ projectId: project.id, ...f, status: 'done' as const })));
    return project.id;
  }

  it('should merge split parts, renumber contiguously, and record the audit trail', async () => {
    const projectId = await seedProject();

    const result = await service.recombine(projectId);

    expect(result).toMatchObject({ applied: true, before: 6, after: 4, ambiguous: [] });
    expect(result.merged).toEqual([
      { number: 2, title: 'The Gate', parts: 2 },
      { number: 3, title: 'The Road', parts: 2 },
    ]);

    const rows = await db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: [asc(schema.chapters.number)] });
    expect(rows.map(r => r.number)).toEqual([1, 2, 3, 4]);
    expect(rows.map(r => r.title)).toEqual(['Chapter 1 - Awakening', 'The Gate', 'The Road', 'Chapter 4 - Dawn']);

    const gate = rows[1];
    expect(gate?.content).toBe('Part one of the gate.\n\nPart two of the gate.');
    expect(gate?.wordCount).toBe(10);
    expect(gate?.mergedFrom).toEqual([
      { number: 2, title: 'Chapter 2 - The Gate (1/2)', words: 5 },
      { number: 3, title: 'Chapter 2 - The Gate (2/2)', words: 5 },
    ]);
  });

  it('should be a no-op on a second run', async () => {
    const projectId = await seedProject();
    await service.recombine(projectId);

    const second = await service.recombine(projectId);
    expect(second).toMatchObject({ applied: false, before: 4, after: 4, merged: [] });
  });

  it('should plan without writing in dry-run mode', async () => {
    const projectId = await seedProject();

    const result = await service.recombine(projectId, { dryRun: true });
    expect(result).toMatchObject({ applied: false, before: 6, after: 4 });

    const rows = await db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId) });
    expect(rows).toHaveLength(6);
  });

  it('should enforce the chapters-exist and derived-data guards', async () => {
    const empty = await seedProject({ withChapters: false });
    expect(service.recombine(empty)).rejects.toThrow(/requires chapters to exist/);

    const extracted = await seedProject();
    await db.insert(schema.briefs).values({ projectId: extracted, chapter: 1, body: 'brief body' });
    expect(service.recombine(extracted)).rejects.toThrow(/renumbering would corrupt/);

    const novel = await seedProject({ kind: 'new_novel' });
    expect(service.recombine(novel)).rejects.toThrow(/not valid for this project kind/);
  });

  it('should log-and-skip guard violations in autoRecombine', async () => {
    const empty = await seedProject({ withChapters: false });
    expect(await service.autoRecombine(empty)).toBeNull();
  });

  describe('AI boundary resolution', () => {
    async function seedBareRepeat(): Promise<bigint> {
      const [project] = await db
        .insert(schema.projects)
        .values({ name: `recombine-ai-${Date.now()}-${Math.random()}`, kind: 'source' })
        .returning();
      if (!project) throw new Error('failed to seed project');
      await db.insert(schema.chapters).values([
        { projectId: project.id, number: 1, title: 'The Gate', content: 'The blade fell and', status: 'done' },
        { projectId: project.id, number: 2, title: 'The Gate', content: 'the guard caught it.', status: 'done' },
        { projectId: project.id, number: 3, title: 'The Road', content: 'Onward.', status: 'done' },
      ]);
      return project.id;
    }

    it('should merge a bare repeat when the model says merge and render prose excerpts', async () => {
      const projectId = await seedBareRepeat();
      const calls: Record<string, unknown>[] = [];
      const aiService = buildService([{ afterChapter: 1, verdict: 'merge' }], calls);

      const result = await aiService.recombine(projectId, { useAi: true });
      expect(result).toMatchObject({ applied: true, before: 3, after: 2, ambiguous: [] });
      expect(String(calls[0]?.['boundaries'])).toContain('flag: bare_repeat');
      expect(String(calls[0]?.['boundaries'])).toContain('the guard caught it.');

      const gate = await db.query.chapters.findFirst({ where: eq(schema.chapters.projectId, projectId), orderBy: [asc(schema.chapters.number)] });
      expect(gate?.content).toBe('The blade fell and\n\nthe guard caught it.');
    });

    it('should keep split verdicts and ignore decisions for undisputed boundaries', async () => {
      const projectId = await seedBareRepeat();
      const aiService = buildService([
        { afterChapter: 1, verdict: 'split' },
        { afterChapter: 2, verdict: 'merge' },
      ]);

      const result = await aiService.recombine(projectId, { useAi: true });
      expect(result).toMatchObject({ applied: false, before: 3, after: 3 });
      expect(result.ambiguous).toEqual([{ afterNumber: 1, reason: 'bare_repeat' }]);
    });

    it('should fall back to the deterministic plan when the model call fails', async () => {
      const projectId = await seedBareRepeat();
      const aiService = buildService(new Error('model unavailable'));

      const result = await aiService.recombine(projectId, { useAi: true });
      expect(result).toMatchObject({ applied: false, before: 3, after: 3 });
    });
  });
});
