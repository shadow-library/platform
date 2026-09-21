import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { CatalogService, RICH_DESCRIPTOR_CHARS, SHORT_DESCRIPTOR_CHARS } from '@modules/ai/context/catalog.service';
import { ARC_PLAN_BIBLE_BUDGET, ARC_PLAN_BIBLE_FLOOR, ARC_PLAN_BUDGET, ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { countTokens } from '@modules/ai/context/token-budget';
import { GenerationService } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginProposals } from '@tests/fixtures/plugin-policy';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_planner_context`;

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

const longBody = (subject: string, sentences: number): string =>
  Array.from({ length: sentences }, (_, i) => `${subject} keeps ledger ${i} of the canal tolls and trusts nobody who reads them aloud.`).join(' ');

const bookPages = (subject: string, count: number): string =>
  Array.from({ length: count }, (_, i) => `Page ${i}. ${`${subject} sets the order in which the sluices open at the spring flood. `.repeat(12)}`).join('\n\n');

interface CatalogRows {
  entities: Record<string, unknown>[];
  worldFacts: Record<string, unknown>[];
  plotThreads: Record<string, unknown>[];
  mysteries: Record<string, unknown>[];
  canonFacts: Record<string, unknown>[];
}

function stubCatalog(rows: CatalogRows): CatalogService {
  const table = (data: unknown[]) => ({ findMany: async () => data });
  const db = {
    query: {
      chapters: table([]),
      volumes: table([]),
      entities: table(rows.entities),
      worldFacts: table(rows.worldFacts),
      plotThreads: table(rows.plotThreads),
      mysteries: table(rows.mysteries),
      canonFacts: table(rows.canonFacts),
      characterKnowledge: table([]),
      bibleDocuments: table([]),
    },
  };
  return new CatalogService({ getPostgresClient: () => db } as never);
}

describe('catalog ordering', () => {
  const rows: CatalogRows = {
    entities: Array.from({ length: 140 }, (_, i) => ({
      entityKey: `bystander_${String(i).padStart(3, '0')}`,
      type: 'character',
      status: 'active',
      significance: 'major',
      body: longBody(`Bystander ${i}`, 12),
      notes: null,
    })),
    worldFacts: Array.from({ length: 12 }, (_, i) => ({ category: `district_${i % 3}`, key: `rule_${i}` })),
    plotThreads: Array.from({ length: 6 }, (_, i) => ({ threadKey: `thread_${i}`, summary: 'open', openedChapter: 1, lastAdvancedChapter: 4 })),
    mysteries: Array.from({ length: 6 }, (_, i) => ({ mysteryKey: `mystery_${i}`, question: 'who?', openedChapter: 2, lastAdvancedChapter: null })),
    canonFacts: Array.from({ length: 6 }, (_, i) => ({ id: BigInt(i), factKey: `fact_${i}`, text: 'A rule.', revealChapter: null })),
  };
  const reversed = (data: CatalogRows): CatalogRows => ({
    entities: [...data.entities].reverse(),
    worldFacts: [...data.worldFacts].reverse(),
    plotThreads: [...data.plotThreads].reverse(),
    mysteries: [...data.mysteries].reverse(),
    canonFacts: [...data.canonFacts].reverse(),
  });

  it('should render the same catalog whatever order the rows arrive in', async () => {
    const forward = await stubCatalog(rows).render(1n);
    const backward = await stubCatalog(reversed(rows)).render(1n);

    expect(backward).toBe(forward);
    expect(forward.split('ENTITIES:\n')[1]?.startsWith('bystander_000 — ')).toBe(true);
  });

  it('should rank a focus key by its first mention', async () => {
    const rendered = await stubCatalog(rows).render(1n, { focusEntityKeys: ['bystander_120', 'bystander_050', 'bystander_120'] });
    const entityLines = rendered.split('ENTITIES:\n')[1]?.split('\n') ?? [];

    expect(entityLines[0]?.startsWith('bystander_120 — ')).toBe(true);
    expect(entityLines[1]?.startsWith('bystander_050 — ')).toBe(true);
  });

  it('should trim to its ceiling, losing world facts before canon facts and unscheduled facts before scheduled ones', async () => {
    const facts = Array.from({ length: 300 }, (_, i) => ({ id: BigInt(i), factKey: `fact_${String(i).padStart(3, '0')}`, text: longBody('The sluice', 2), revealChapter: null }));
    const scheduled = { id: 999n, factKey: 'zz_scheduled_reveal', text: 'The gate is rigged.', revealChapter: 9 };
    const catalog = stubCatalog({ ...rows, entities: rows.entities.slice(0, 5), canonFacts: [...facts, scheduled] });

    const rendered = await catalog.render(1n, { maxTokens: 3_000 });

    expect(countTokens(rendered)).toBeLessThanOrEqual(3_000);
    expect(rendered).toContain('(+3 world fact categories omitted)');
    expect(rendered).toContain('lower-priority canon facts omitted)');
    expect(rendered.split('CANON FACTS:\n')[1]).toContain('zz_scheduled_reveal: The gate is rigged. (unrevealed; scheduled ch 9)');
  });
});

describe.if(pgAvailable)('planner context', () => {
  let db: PrimaryDatabase;
  let catalog: CatalogService;
  let assembler: ContextAssembler;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    catalog = new CatalogService(databaseService);
    assembler = new ContextAssembler(databaseService, catalog);
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(name: string): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `${name}-${Date.now()}-${Math.random()}`, kind: 'new_novel', premise: 'A canal town runs on its locks.' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  describe('catalog', () => {
    it('should list citable bible documents with a label and an excerpt, skipping empty ones', async () => {
      const projectId = await seedProject('catalog-docs');
      await db.insert(schema.bibleDocuments).values([
        { projectId, section: 'world', slug: 'lock-law', frontmatter: { title: 'The Law of Locks' }, body: '# Ignored Heading\n\nEvery barge pays at the upper lock.' },
        { projectId, section: 'power', slug: 'gauges', body: '# Reading the Gauges\n\nA keeper reads water the way a scholar reads script.' },
        { projectId, section: 'plot', slug: 'spring-flood', body: 'The flood arrives in the third month.' },
        { projectId, section: 'lore', slug: 'empty-notes', body: '   \n\n  ' },
        { projectId, section: 'lore', slug: 'no-body', body: null },
      ]);

      const rendered = await catalog.render(projectId, { documents: true });

      expect(rendered).toContain('BIBLE DOCUMENTS (cite with the ref exactly as written):');
      expect(rendered).toContain('bible_doc:world/lock-law — The Law of Locks: Every barge pays at the upper lock.');
      expect(rendered).toContain('bible_doc:power/gauges — Reading the Gauges: A keeper reads water the way a scholar reads script.');
      expect(rendered).toContain('bible_doc:plot/spring-flood — Spring flood: The flood arrives in the third month.');
      expect(rendered).not.toContain('empty-notes');
      expect(rendered).not.toContain('no-body');
      expect(rendered.indexOf('bible_doc:plot/spring-flood')).toBeLessThan(rendered.indexOf('bible_doc:world/lock-law'));
    });

    it('should leave bible documents out unless asked for them', async () => {
      const projectId = await seedProject('catalog-no-docs');
      await db.insert(schema.bibleDocuments).values({ projectId, section: 'world', slug: 'lock-law', body: 'Every barge pays.' });

      expect(await catalog.render(projectId)).not.toContain('bible_doc:');
    });

    it('should describe entities in whole words well past eighty characters', async () => {
      const projectId = await seedProject('catalog-descriptors');
      const body = longBody('The harbourmaster', 12);
      await db.insert(schema.entities).values({ projectId, entityKey: 'harbourmaster', type: 'character', name: 'Harbourmaster', body });

      const rendered = await catalog.render(projectId);
      const line = rendered.split('\n').find(l => l.startsWith('harbourmaster — ')) ?? '';
      const descriptor = line.slice('harbourmaster — character: '.length, line.lastIndexOf(' ('));

      expect(descriptor.length).toBeGreaterThan(SHORT_DESCRIPTOR_CHARS);
      expect(descriptor.length).toBeLessThanOrEqual(RICH_DESCRIPTOR_CHARS + 1);
      expect(descriptor.endsWith('aloud.')).toBe(true);
      expect(body.startsWith(descriptor)).toBe(true);
    });

    it('should keep chat hub descriptors short and still cut them between words', async () => {
      const projectId = await seedProject('catalog-compact');
      const body = longBody('The ferrywoman', 12);
      await db.insert(schema.entities).values({ projectId, entityKey: 'ferrywoman', type: 'character', name: 'Ferrywoman', body });

      const rendered = await catalog.render(projectId, { descriptors: 'compact' });
      const line = rendered.split('\n').find(l => l.startsWith('ferrywoman — ')) ?? '';
      const descriptor = line.slice('ferrywoman — character: '.length, line.lastIndexOf(' ('));

      expect(descriptor.length).toBeLessThanOrEqual(SHORT_DESCRIPTOR_CHARS + 1);
      expect(body.startsWith(descriptor.replace(/…$/, ''))).toBe(true);
      expect(/[\s.]/.test(body.charAt(descriptor.replace(/…$/, '').length))).toBe(true);
    });

    it('should rank the focus cast first and describe it in full when the entity budget runs out', async () => {
      const projectId = await seedProject('catalog-focus');
      await db.insert(schema.entities).values(
        Array.from({ length: 140 }, (_, i) => ({
          projectId,
          entityKey: `bystander_${String(i).padStart(3, '0')}`,
          type: 'character' as const,
          name: `Bystander ${i}`,
          significance: 'major' as const,
          body: longBody(`Bystander ${i}`, 12),
        })),
      );
      await db
        .insert(schema.entities)
        .values({ projectId, entityKey: 'lockkeeper', type: 'character', name: 'Lockkeeper', significance: 'minor', body: longBody('The lockkeeper', 12) });

      const rendered = await catalog.render(projectId, { focusEntityKeys: ['lockkeeper'] });
      const entityLines = rendered.split('ENTITIES:\n')[1]?.split('\n\n')[0]?.split('\n') ?? [];

      expect(entityLines[0]?.startsWith('lockkeeper — ')).toBe(true);
      expect(entityLines[0]?.length).toBeGreaterThan(SHORT_DESCRIPTOR_CHARS * 2);
      expect(entityLines.at(-1)?.length).toBeLessThan(SHORT_DESCRIPTOR_CHARS + 60);
      expect(countTokens(entityLines.join('\n'))).toBeLessThanOrEqual(9_000);
    });
  });

  it('should keep a brief citing a catalog bible document through ref cleanup and resolve it in the chapter pack', async () => {
    const projectId = await seedProject('brief-bible-ref');
    await db.insert(schema.volumes).values({ projectId, volumeKey: 'v1', ordinal: 1, status: 'approved', startChapter: 1, endChapter: 1 });
    await db.insert(schema.entities).values({ projectId, entityKey: 'lockkeeper', type: 'character', name: 'Lockkeeper', body: 'Keeps the upper lock.' });
    await db.insert(schema.bibleDocuments).values({ projectId, section: 'world', slug: 'lock-law', body: '# Lock Law\n\nLOCK_LAW_BODY Every barge pays at the upper lock.' });

    const structured = mock(async (_prompt: unknown, vars: { catalog: string }) => {
      const citedDoc = /bible_doc:\S+/.exec(vars.catalog)?.[0] ?? 'missing';
      return [
        {
          chapter: 1,
          volumeKey: 'v1',
          title: 'Toll Day',
          objective: 'The lockkeeper collects the toll.',
          events: ['a barge arrives'],
          requiredContext: ['entity:lockkeeper', citedDoc, 'bible_doc:world/invented-doc'],
          pov: 'lockkeeper',
          endingContract: { hookType: 'turn', emotionalBeat: 'unease', openQuestion: 'who paid double?', handoffState: 'the gate closes', mustNotResolve: [] },
        },
      ];
    });
    const noop = {} as never;
    const service = new GenerationService(
      { getPostgresClient: () => db } as never,
      noop,
      { structured } as never,
      assembler,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noPluginProposals(),
    );

    await service.outline(projectId, { start: 1, count: 1 });

    const brief = await db.query.briefs.findFirst({ where: eq(schema.briefs.projectId, projectId) });
    expect(brief?.contextRefs).toEqual(['entity:lockkeeper', 'bible_doc:world/lock-law']);

    const pack = await assembler.forChapter(projectId, 1, { dryRun: true });
    expect(pack.unresolvedRefs).toEqual([]);
    expect(pack.rendered).toContain('## BIBLE: world/lock-law');
    expect(pack.rendered).toContain('LOCK_LAW_BODY Every barge pays at the upper lock.');
  });

  it('should give the outline pack a catalog that lists bible documents and prefers the volume cast', async () => {
    const projectId = await seedProject('outline-pack');
    await db.insert(schema.volumes).values({ projectId, volumeKey: 'v1', ordinal: 1, status: 'approved', startChapter: 1, endChapter: 5, cast: ['lockkeeper'] });
    await db.insert(schema.entities).values([
      { projectId, entityKey: 'ferrywoman', type: 'character', name: 'Ferrywoman', significance: 'major', body: 'Runs the night ferry.' },
      { projectId, entityKey: 'lockkeeper', type: 'character', name: 'Lockkeeper', significance: 'minor', body: 'Keeps the upper lock.' },
    ]);
    await db.insert(schema.bibleDocuments).values({ projectId, section: 'power', slug: 'gauges', body: 'A keeper reads water.' });

    const pack = await assembler.forOutline(projectId, 1);
    const catalogSection = pack.sections.find(s => s.key === 'catalog');

    expect(catalogSection?.required).toBe(true);
    expect(pack.rendered).toContain('bible_doc:power/gauges — Gauges: A keeper reads water.');
    expect(pack.rendered.indexOf('lockkeeper — ')).toBeLessThan(pack.rendered.indexOf('ferrywoman — '));
  });

  it('should keep the volume objective and memory in an outline pack whose catalog outgrows the budget', async () => {
    const projectId = await seedProject('outline-ceiling');
    await db.insert(schema.volumes).values([
      { projectId, volumeKey: 'v0', ordinal: 0, status: 'approved', startChapter: 1, endChapter: 2, epitome: 'VOLUME_ZERO_EPITOME The ferry sank.' },
      { projectId, volumeKey: 'v1', ordinal: 1, status: 'approved', startChapter: 3, endChapter: 9, objective: 'VOLUME_OBJECTIVE_MARKER Raise the ferry.' },
    ]);
    await db.insert(schema.chapters).values({ projectId, number: 2, title: 'Sinking', status: 'done', summary: 'RECENT_SUMMARY_MARKER The ferry went down.' });
    await db
      .insert(schema.canonFacts)
      .values(Array.from({ length: 400 }, (_, i) => ({ projectId, factKey: `toll_fact_${i}`, text: `Toll rule ${i}: barges above a certain draught pay a surcharge.` })));
    await db.insert(schema.worldFacts).values(Array.from({ length: 60 }, (_, i) => ({ projectId, category: `district_${i}`, key: `rule_${i}`, value: 'v' })));

    const pack = await assembler.forOutline(projectId, 3, { budgetTokens: 4_000 });

    expect(pack.usedTokens).toBeLessThanOrEqual(4_000);
    expect(pack.omitted).toEqual([]);
    expect(pack.sections.map(s => s.key)).toEqual(['volume_objective', 'memory', 'catalog']);
    expect(pack.rendered).toContain('VOLUME_OBJECTIVE_MARKER');
    expect(pack.rendered).toContain('VOLUME_ZERO_EPITOME');
    expect(pack.rendered).toContain('RECENT_SUMMARY_MARKER');
    expect(pack.rendered).toContain('(+60 world fact categories omitted)');
  });

  describe('arc planning pack', () => {
    async function seedArcProject(name: string): Promise<bigint> {
      const projectId = await seedProject(name);
      await db.insert(schema.volumes).values({ projectId, volumeKey: 'v1', ordinal: 1, status: 'approved', startChapter: 1, endChapter: 20 });
      return projectId;
    }

    it('should carry the premise, reader promise, plot, world and power documents but not the other sections', async () => {
      const projectId = await seedArcProject('arc-docs');
      await db.insert(schema.bibleDocuments).values([
        { projectId, section: 'project', slug: 'premise', body: 'PREMISE_DOC_MARKER' },
        { projectId, section: 'project', slug: 'reader-promise', body: 'PROMISE_DOC_MARKER' },
        { projectId, section: 'project', slug: 'art-style', body: 'ART_STYLE_MARKER' },
        { projectId, section: 'plot', slug: 'spring-flood', body: 'PLOT_DOC_MARKER' },
        { projectId, section: 'world', slug: 'lock-law', body: 'WORLD_DOC_MARKER' },
        { projectId, section: 'power', slug: 'gauges', body: 'POWER_DOC_MARKER' },
        { projectId, section: 'lore', slug: 'songs', body: 'LORE_DOC_MARKER' },
        { projectId, section: 'story_state', slug: 'now', body: 'STATE_DOC_MARKER' },
      ]);

      const pack = await assembler.forArcPlanning(projectId, 'v1');
      const section = pack.sections.find(s => s.key === 'bible_documents');

      expect(section?.segment).toBe('stable');
      for (const marker of ['PREMISE_DOC_MARKER', 'PROMISE_DOC_MARKER', 'PLOT_DOC_MARKER', 'WORLD_DOC_MARKER', 'POWER_DOC_MARKER']) expect(section?.rendered).toContain(marker);
      for (const marker of ['ART_STYLE_MARKER', 'LORE_DOC_MARKER', 'STATE_DOC_MARKER']) expect(pack.rendered).not.toContain(marker);
      expect(pack.rendered.indexOf('## CANON CATALOG')).toBeLessThan(pack.rendered.indexOf('## BIBLE DOCUMENTS'));
    });

    it('should cut oversized documents to fit the pack budget rather than drop the section', async () => {
      const projectId = await seedArcProject('arc-docs-budget');
      await db.insert(schema.bibleDocuments).values([
        { projectId, section: 'plot', slug: 'main-line', body: bookPages('The main line', 80) },
        { projectId, section: 'world', slug: 'canal', body: bookPages('The canal', 80) },
        { projectId, section: 'power', slug: 'gauges', body: bookPages('The gauge', 80) },
      ]);

      const pack = await assembler.forArcPlanning(projectId, 'v1');
      const section = pack.sections.find(s => s.key === 'bible_documents');

      expect(pack.budgetTokens).toBe(ARC_PLAN_BUDGET);
      expect(pack.omitted).toEqual([]);
      expect(section?.truncated).toBe(true);
      expect(section?.tokens).toBeLessThanOrEqual(ARC_PLAN_BIBLE_BUDGET + 20);
      for (const ref of ['bible_doc:plot/main-line', 'bible_doc:world/canal', 'bible_doc:power/gauges']) expect(section?.rendered).toContain(ref);
      expect(pack.usedTokens).toBeLessThanOrEqual(ARC_PLAN_BUDGET);
    });

    it('should cap the catalog so the documents keep their floor under a tight budget', async () => {
      const projectId = await seedArcProject('arc-docs-crowded');
      await db.insert(schema.canonFacts).values(
        Array.from({ length: 400 }, (_, i) => ({
          projectId,
          factKey: `toll_fact_${i}`,
          text: `Toll rule ${i}: barges above a certain draught pay a surcharge at the upper lock in flood season.`,
        })),
      );
      await db.insert(schema.bibleDocuments).values([
        { projectId, section: 'plot', slug: 'main-line', body: bookPages('The main line', 80) },
        { projectId, section: 'world', slug: 'canal', body: bookPages('The canal', 80) },
      ]);

      const pack = await assembler.forArcPlanning(projectId, 'v1', { budgetTokens: 16_000 });
      const section = pack.sections.find(s => s.key === 'bible_documents');

      expect(pack.omitted).toEqual([]);
      expect(pack.sections.find(s => s.key === 'catalog')?.rendered).toContain('lower-priority canon facts omitted)');
      expect(section?.tokens).toBeGreaterThanOrEqual(ARC_PLAN_BIBLE_FLOOR - 100);
      expect(section?.tokens).toBeLessThan(ARC_PLAN_BIBLE_BUDGET);
      expect(pack.usedTokens).toBeLessThanOrEqual(16_000);
    });

    it('should keep the cached sections byte-identical when only the dormant threads change', async () => {
      const projectId = await seedArcProject('arc-docs-cache');
      await db.update(schema.projects).set({ storyCurrentChapter: 3 }).where(eq(schema.projects.id, projectId));
      await db.insert(schema.plotThreads).values({ projectId, threadKey: 'the-toll-dispute', status: 'open', openedChapter: 1, lastAdvancedChapter: 2 });
      await db
        .insert(schema.canonFacts)
        .values(Array.from({ length: 300 }, (_, i) => ({ projectId, factKey: `toll_fact_${i}`, text: `Toll rule ${i}: barges above a certain draught pay a surcharge.` })));
      await db.insert(schema.bibleDocuments).values({ projectId, section: 'plot', slug: 'main-line', body: bookPages('The main line', 80) });

      const before = await assembler.forArcPlanning(projectId, 'v1', { budgetTokens: 16_000 });
      await db.update(schema.projects).set({ storyCurrentChapter: 40 }).where(eq(schema.projects.id, projectId));
      const after = await assembler.forArcPlanning(projectId, 'v1', { budgetTokens: 16_000 });

      expect(before.sections.some(s => s.key === 'dormant_threads')).toBe(false);
      expect(after.sections.some(s => s.key === 'dormant_threads')).toBe(true);
      expect(after.sections.find(s => s.key === 'bible_documents')?.truncated).toBe(true);
      expect(after.renderedStable).toBe(before.renderedStable);
    });
  });
});
