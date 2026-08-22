import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { applyContinuityDelta } from '@modules/ai/graphs/apply-continuity';
import { type ContinuityOutput } from '@modules/ai/schemas';
import { parseKnowledgeContract } from '@modules/bible/fact/knowledge-view';
import { GenerationService } from '@modules/generation/generation.service';
import { type Generation, type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_knowledge_contract`;

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

const ENDING_CONTRACT = { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: 'who?', handoffState: 'cornered', mustNotResolve: [] };

function modelBrief(chapter: number) {
  return {
    chapter,
    volumeKey: 'vol_1',
    title: `Chapter ${chapter}`,
    objective: 'objective',
    events: ['a beat'],
    requiredContext: [],
    pov: 'amara',
    endingContract: ENDING_CONTRACT,
    knowledgeContract: { pov: ['amara', 'rook'], learns: [{ entityKey: 'amara', factKey: 'the_heir' }] },
  };
}

function delta(overrides: Partial<ContinuityOutput> = {}): ContinuityOutput {
  return {
    appeared: [],
    newEntities: [],
    threads: [],
    mysteries: [],
    timeline: [],
    relationships: [],
    power: [],
    characterStates: [],
    knowledgeChanges: [],
    chapterSummary: 'Things happened.',
    ...overrides,
  } as ContinuityOutput;
}

describe.if(pgAvailable)('outliner-authored knowledge contracts', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  function buildService(briefs: ReturnType<typeof modelBrief>[]): GenerationService {
    const databaseService = { getPostgresClient: () => db } as never;
    const contextAssembler = new ContextAssembler(databaseService, new CatalogService(databaseService));
    const noop = {} as never;
    return new GenerationService(databaseService, noop, { structured: mock(async () => briefs) } as never, contextAssembler, noop, noop, noop, noop, noop, noop, noop, noop);
  }

  interface ProjectFixture {
    handEditedChapters?: number[];
    facts?: { factKey: string; text: string; revealChapter?: number }[];
  }

  async function seedProject({ handEditedChapters = [], facts = [] }: ProjectFixture = {}): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `knowledge-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    const projectId = project.id;

    await db.insert(schema.volumes).values({ projectId, volumeKey: 'vol_1', ordinal: 1, status: 'approved', startChapter: 1, endChapter: 3, objective: 'survive' });
    await db.insert(schema.arcs).values({ projectId, arcKey: 'vol_1_arc_1', volumeKey: 'vol_1', ordinal: 1, chapterStart: 1, chapterEnd: 3, status: 'approved' });
    if (handEditedChapters.length > 0) {
      await db.insert(schema.briefs).values(
        handEditedChapters.map(chapter => ({
          projectId,
          chapter,
          volumeKey: 'vol_1',
          arcKey: 'vol_1_arc_1',
          body: `hand-written brief ${chapter}`,
          pov: 'kestrel',
          knowledgeContract: { pov: ['kestrel'], learns: [] },
          handEdited: true,
        })),
      );
    }
    if (facts.length > 0) {
      await db.insert(schema.canonFacts).values(facts.map(f => ({ projectId, factKey: f.factKey, text: f.text, revealChapter: f.revealChapter ?? null })));
    }
    return projectId;
  }

  function briefOf(projectId: bigint, chapter: number): Promise<Generation.Brief | undefined> {
    return db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
  }

  it('should persist pov and knowledgeContract from an arc-scoped outline', async () => {
    const projectId = await seedProject();
    const service = buildService([modelBrief(1), modelBrief(2), modelBrief(3)]);

    await service.outlineArc(projectId, 'vol_1_arc_1', {});

    const brief = await briefOf(projectId, 2);
    expect(brief?.pov).toBe('amara');
    expect(brief?.knowledgeContract).toEqual({ pov: ['amara', 'rook'], learns: [{ entityKey: 'amara', factKey: 'the_heir' }] });
  });

  it('should persist pov and knowledgeContract from a whole-book outline', async () => {
    const projectId = await seedProject();
    const service = buildService([modelBrief(1), modelBrief(2), modelBrief(3)]);

    await service.outline(projectId, { start: 1, count: 3 });

    const brief = await briefOf(projectId, 1);
    expect(brief?.pov).toBe('amara');
    expect(brief?.knowledgeContract).toMatchObject({ pov: ['amara', 'rook'] });
  });

  it('should leave pov and knowledgeContract null when the model omits them', async () => {
    const projectId = await seedProject();
    const bare = { ...modelBrief(1), pov: undefined, knowledgeContract: undefined } as unknown as ReturnType<typeof modelBrief>;
    const service = buildService([bare]);

    await service.outline(projectId, { start: 1, count: 1 });

    const brief = await briefOf(projectId, 1);
    expect(brief?.pov).toBeNull();
    expect(brief?.knowledgeContract).toBeNull();
  });

  it('should not overwrite a hand-edited brief’s pov or knowledgeContract on re-outline', async () => {
    const projectId = await seedProject({ handEditedChapters: [2] });
    const service = buildService([modelBrief(1), modelBrief(2), modelBrief(3)]);

    await service.outlineArc(projectId, 'vol_1_arc_1', {});

    const protectedBrief = await briefOf(projectId, 2);
    expect(protectedBrief?.pov).toBe('kestrel');
    expect(protectedBrief?.knowledgeContract).toEqual({ pov: ['kestrel'], learns: [] });
    expect((await briefOf(projectId, 3))?.pov).toBe('amara');
  });

  it('should produce a knowledgeContract the knowledge view can parse', async () => {
    const projectId = await seedProject();
    const service = buildService([modelBrief(1)]);

    await service.outline(projectId, { start: 1, count: 1 });

    const brief = await briefOf(projectId, 1);
    expect(parseKnowledgeContract(brief?.knowledgeContract)).toEqual({ pov: ['amara', 'rook'], learns: [{ entityKey: 'amara', factKey: 'the_heir' }] });
  });

  it('should list canon fact keys in the catalog, including still-hidden ones', async () => {
    const projectId = await seedProject({
      facts: [
        { factKey: 'the_heir', text: 'Amara is the lost heir.' },
        { factKey: 'the_pact', text: 'The covenant sold the city.', revealChapter: 4 },
      ],
    });
    const catalog = new CatalogService({ getPostgresClient: () => db } as never);

    const rendered = await catalog.render(projectId);

    expect(rendered).toContain('CANON FACTS:');
    expect(rendered).toContain('the_heir: Amara is the lost heir. (unrevealed)');
    expect(rendered).toContain('the_pact: The covenant sold the city. (revealed ch 4)');
  });

  it('should keep the canon-fact catalog out of the prose-generation pack', async () => {
    const projectId = await seedProject({ facts: [{ factKey: 'the_heir', text: 'Amara is the lost heir.' }] });
    const databaseService = { getPostgresClient: () => db } as never;
    const assembler = new ContextAssembler(databaseService, new CatalogService(databaseService));
    await db.insert(schema.briefs).values({ projectId, chapter: 1, volumeKey: 'vol_1', body: 'write chapter one' });

    const pack = await assembler.forChapter(projectId, 1, { dryRun: true });

    expect(pack.rendered).not.toContain('CANON FACTS:');
    expect(pack.rendered).not.toContain('Amara is the lost heir.');
  });

  it('should persist a mystery’s truthFactKey and never null it out on a later extraction', async () => {
    const projectId = await seedProject();
    const mysteryOf = () => db.query.mysteries.findFirst({ where: eq(schema.mysteries.projectId, projectId) });

    await db.transaction(tx =>
      applyContinuityDelta(tx, projectId, 1, delta({ mysteries: [{ mysteryKey: 'the_heir_mystery', status: 'open', question: 'who is the heir?', truthFactKey: 'the_heir' }] })),
    );
    expect(await mysteryOf()).toMatchObject({ question: 'who is the heir?', truthFactKey: 'the_heir' });

    await db.transaction(tx => applyContinuityDelta(tx, projectId, 2, delta({ mysteries: [{ mysteryKey: 'the_heir_mystery', status: 'open' }] })));
    expect(await mysteryOf()).toMatchObject({ question: 'who is the heir?', truthFactKey: 'the_heir' });
  });
});
