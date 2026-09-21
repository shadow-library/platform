import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { noPluginProposals } from '@tests/fixtures/plugin-policy';
import { countTokens } from '@modules/ai/context/token-budget';
import { GenerationService, PLAN_BIBLE_BUDGET, PLAN_BIBLE_DOC_TOKENS } from '@modules/generation/generation.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_plan_bible_docs`;

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

describe.if(pgAvailable)('plan() reads bible documents', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function createProject(brief: string): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `plan-bible-${Date.now()}-${Math.random()}`, kind: 'new_novel', brief })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  const planVolume = {
    volumeKey: 'vol_01',
    ordinal: 1,
    title: 'Opening',
    objective: 'establish stakes',
    conflict: 'the ledger surfaces',
    payoff: 'first confrontation',
    startChapter: 1,
    endChapter: 8,
  };

  function buildService(structured: ReturnType<typeof mock>): GenerationService {
    const databaseService = { getPostgresClient: () => db } as never;
    const modelRouter = { structured } as never;
    const noop = {} as never;
    return new GenerationService(databaseService, noop, modelRouter, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noPluginProposals());
  }

  it('passes rendered bible-document content to the model call when bible docs exist', async () => {
    const projectId = await createProject('A forger uncovers a ledger.');
    await db.insert(schema.bibleDocuments).values([
      { projectId, section: 'world', slug: 'foundation', body: 'The city of Vane runs on forged paperwork.' },
      { projectId, section: 'plot', slug: 'plot', body: 'The ledger investigation escalates across three volumes.' },
    ]);

    const structured = mock(async () => [planVolume]);
    const service = buildService(structured);

    await service.plan(projectId, { volumeCount: 1, chaptersPerVolume: 8 });

    expect(structured).toHaveBeenCalledTimes(1);
    const [, vars] = structured.mock.calls[0] as unknown as [unknown, { bibleDocs: string }];
    expect(vars.bibleDocs).toContain('### bible_doc:world/foundation');
    expect(vars.bibleDocs).toContain('The city of Vane runs on forged paperwork.');
    expect(vars.bibleDocs).toContain('### bible_doc:plot/plot');
    expect(vars.bibleDocs).toContain('The ledger investigation escalates across three volumes.');
  });

  it('falls back to an explicit placeholder when the project has no bible documents yet', async () => {
    const projectId = await createProject('A fresh brief with nothing built yet.');

    const structured = mock(async () => [planVolume]);
    const service = buildService(structured);

    const { volumes } = await service.plan(projectId, { volumeCount: 1, chaptersPerVolume: 8 });
    expect(volumes).toHaveLength(1);

    const [, vars] = structured.mock.calls[0] as unknown as [unknown, { bibleDocs: string }];
    expect(vars.bibleDocs).toBe('(no bible written yet)');
  });

  it('caps each document contribution instead of concatenating full bodies unbounded', async () => {
    const projectId = await createProject('A brief with an oversized bible doc.');
    const oversized = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} of dense canon prose describing the world in great detail.`).join('\n\n');
    await db.insert(schema.bibleDocuments).values([{ projectId, section: 'world', slug: 'foundation', body: oversized }]);

    const structured = mock(async () => [planVolume]);
    const service = buildService(structured);

    await service.plan(projectId, { volumeCount: 1, chaptersPerVolume: 8 });

    const [, vars] = structured.mock.calls[0] as unknown as [unknown, { bibleDocs: string }];
    expect(vars.bibleDocs.length).toBeLessThan(oversized.length);
    expect(vars.bibleDocs).toContain('### bible_doc:world/foundation');
    expect(countTokens(vars.bibleDocs)).toBeLessThanOrEqual(PLAN_BIBLE_DOC_TOKENS + 40);
  });

  it('should keep the whole bible within its budget and give the core documents priority over the rest', async () => {
    const projectId = await createProject('A brief with a large bible.');
    const pages = (subject: string): string => Array.from({ length: 300 }, (_, i) => `${subject} page ${i} describes the canal district in careful detail.`).join('\n\n');
    await db
      .insert(schema.bibleDocuments)
      .values([
        ...Array.from({ length: 8 }, (_, i) => ({ projectId, section: 'lore' as const, slug: `songs-${i}`, body: pages(`Song ${i}`) })),
        ...Array.from({ length: 6 }, (_, i) => ({ projectId, section: 'plot' as const, slug: `line-${i}`, body: pages(`Line ${i}`) })),
      ]);

    const structured = mock(async () => [planVolume]);
    await buildService(structured).plan(projectId, { volumeCount: 1, chaptersPerVolume: 8 });

    const [, vars] = structured.mock.calls[0] as unknown as [unknown, { bibleDocs: string }];
    expect(countTokens(vars.bibleDocs)).toBeLessThanOrEqual(PLAN_BIBLE_BUDGET);
    for (let i = 0; i < 6; i++) expect(vars.bibleDocs).toContain(`### bible_doc:plot/line-${i}`);
    expect(vars.bibleDocs.indexOf('bible_doc:plot/line-0')).toBeLessThan(vars.bibleDocs.indexOf('bible_doc:lore/'));
  });
});
