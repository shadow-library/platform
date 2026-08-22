import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { GenerationService, MAX_WHOLE_BOOK_OUTLINE_SPAN } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_outline_invariants`;

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

function brief(chapter: number, requiredContext: string[], overrides: Partial<{ continuesIntoNextChapter: boolean; startsFromPreviousChapter: boolean }> = {}) {
  return {
    chapter,
    volumeKey: 'v1',
    title: `Chapter ${chapter}`,
    objective: 'advance the plot',
    events: ['something happens'],
    requiredContext,
    continuesIntoNextChapter: false,
    startsFromPreviousChapter: false,
    ...overrides,
    endingContract: { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: 'what now', handoffState: 'mid-fall', mustNotResolve: [] },
  };
}

describe.if(pgAvailable)('outline invariant enforcement', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function createApprovedVolume(endChapter = 3): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `outline-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.volumes).values({ projectId: project.id, volumeKey: 'v1', ordinal: 1, status: 'approved', startChapter: 1, endChapter });
    return project.id;
  }

  function buildService(structuredOutput: unknown, unresolvedRefs: Set<string>): GenerationService {
    const databaseService = { getPostgresClient: () => db } as never;
    const modelRouter = { structured: mock(async () => structuredOutput) } as never;
    const contextAssembler = {
      catalog: async () => 'CATALOG',
      resolveRefs: async (_projectId: bigint, refs: string[]) => ({
        resolved: refs.filter(r => !unresolvedRefs.has(r)).map(r => ({ key: r, tier: 'canonical', segment: 'stable', tokens: 1, sourceRefs: [r], rendered: r })),
        unresolved: refs.filter(r => unresolvedRefs.has(r)),
      }),
    } as never;
    const noop = {} as never;
    return new GenerationService(databaseService, noop, modelRouter, contextAssembler, noop, noop, noop, noop, noop, noop, noop, noop);
  }

  function buildSpanService(): { service: GenerationService; structured: ReturnType<typeof mock> } {
    const databaseService = { getPostgresClient: () => db } as never;
    const structured = mock(async (_prompt: unknown, vars: { startChapter: number; endChapter: number }) =>
      Array.from({ length: vars.endChapter - vars.startChapter + 1 }, (_, i) => brief(vars.startChapter + i, [])),
    );
    const modelRouter = { structured } as never;
    const contextAssembler = { catalog: async () => 'CATALOG', resolveRefs: async (_projectId: bigint, refs: string[]) => ({ resolved: [], unresolved: refs }) } as never;
    const noop = {} as never;
    const service = new GenerationService(databaseService, noop, modelRouter, contextAssembler, noop, noop, noop, noop, noop, noop, noop, noop);
    return { service, structured };
  }

  it('drops refs missing from the catalog without failing the outline call', async () => {
    const projectId = await createApprovedVolume();
    const output = [brief(1, ['entity:known', 'entity:phantom']), brief(2, ['entity:known']), brief(3, [])];
    const service = buildService(output, new Set(['entity:phantom']));

    const { briefs } = await service.outline(projectId, { start: 1, count: 3 });
    expect(briefs).toHaveLength(3);

    const persisted = await db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), orderBy: schema.briefs.chapter });
    expect(persisted.map(b => b.contextRefs)).toEqual([['entity:known'], ['entity:known'], []]);
  });

  it('rejects outlines with coverage gaps by re-entering the repair ladder', async () => {
    // The repair ladder lives inside modelRouter.structured; here we assert the postValidate wiring
    // itself, via the same coverage validator the router runs against buildOutlinePrompt's output.
    const { buildOutlinePrompt } = await import('@modules/ai/prompts');
    const prompt = buildOutlinePrompt(1, 3);
    const gappy = [brief(1, []), brief(3, [])];
    expect(prompt.postValidate?.(gappy as never)).toContain('chapter 2 is missing from the outline');
  });

  it('rejects duplicate chapter numbers via the same wiring', async () => {
    const { buildOutlinePrompt } = await import('@modules/ai/prompts');
    const prompt = buildOutlinePrompt(1, 2);
    const duped = [brief(1, []), brief(1, [])];
    expect(prompt.postValidate?.(duped as never)).toContain('chapter 1 appears more than once in the outline');
  });

  it('rejects a broken continuesIntoNextChapter/startsFromPreviousChapter chain via the same wiring', async () => {
    const { buildOutlinePrompt } = await import('@modules/ai/prompts');
    const prompt = buildOutlinePrompt(1, 2);
    const broken = [brief(1, [], { continuesIntoNextChapter: true }), brief(2, [])];
    const errors = prompt.postValidate?.(broken as never) ?? [];
    expect(errors.some(e => e.includes('chapter 1 sets continuesIntoNextChapter'))).toBe(true);
  });

  it('clamps a no-count whole-book outline to MAX_WHOLE_BOOK_OUTLINE_SPAN when the volumes sum to more', async () => {
    const projectId = await createApprovedVolume(MAX_WHOLE_BOOK_OUTLINE_SPAN + 20);
    const { service, structured } = buildSpanService();

    await service.outline(projectId, {});

    const vars = structured.mock.calls.at(-1)?.[1] as { startChapter: number; endChapter: number };
    expect(vars.endChapter - vars.startChapter + 1).toBe(MAX_WHOLE_BOOK_OUTLINE_SPAN);
  });

  it('clamps an explicit count larger than MAX_WHOLE_BOOK_OUTLINE_SPAN the same way', async () => {
    const projectId = await createApprovedVolume(MAX_WHOLE_BOOK_OUTLINE_SPAN + 20);
    const { service, structured } = buildSpanService();

    await service.outline(projectId, { count: MAX_WHOLE_BOOK_OUTLINE_SPAN + 50 });

    const vars = structured.mock.calls.at(-1)?.[1] as { startChapter: number; endChapter: number };
    expect(vars.endChapter - vars.startChapter + 1).toBe(MAX_WHOLE_BOOK_OUTLINE_SPAN);
  });

  it('leaves a small whole-book outline (well under the cap) unaffected', async () => {
    const projectId = await createApprovedVolume(3);
    const { service, structured } = buildSpanService();

    await service.outline(projectId, {});

    const vars = structured.mock.calls.at(-1)?.[1] as { startChapter: number; endChapter: number };
    expect(vars).toMatchObject({ startChapter: 1, endChapter: 3 });
  });
});
