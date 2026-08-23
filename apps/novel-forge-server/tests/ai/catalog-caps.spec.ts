import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_catalog_caps`;

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

describe.if(pgAvailable)('catalog and validation-window caps', () => {
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
    const [project] = await db.insert(schema.projects).values({ name, kind: 'new_novel', premise: 'p' }).returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('renders world facts as keys-only within a validation window, not full values', async () => {
    const projectId = await seedProject(`catalog-caps-window-${Date.now()}`);
    await db.insert(schema.worldFacts).values([
      { projectId, category: 'geography', key: 'capital_city', value: 'A very long description of the capital that would be expensive to repeat every window.' },
      { projectId, category: 'geography', key: 'northern_wastes', value: 'Another long value.' },
    ]);

    const pack = await assembler.forValidationWindow(projectId, 1, 5);
    expect(pack.rendered).toContain('capital_city');
    expect(pack.rendered).toContain('northern_wastes');
    expect(pack.rendered).not.toContain('very long description');
  });

  it('caps catalog chapters to the most recent N and reports the omitted count', async () => {
    const projectId = await seedProject(`catalog-caps-chapters-${Date.now()}`);
    const total = 55;
    await db.insert(schema.chapters).values(Array.from({ length: total }, (_, i) => ({ projectId, number: i + 1, title: `Chapter ${i + 1}`, status: 'done' as const })));

    const rendered = await catalog.render(projectId);
    expect(rendered).toContain('(+5 earlier chapters omitted)');
    expect(rendered).not.toMatch(/(^|\n)1 — Chapter 1(\n|$)/);
    expect(rendered).toContain(`${total} — Chapter ${total}`);
  });

  it('renders all chapters with no omission note when under the cap', async () => {
    const projectId = await seedProject(`catalog-caps-chapters-under-${Date.now()}`);
    await db.insert(schema.chapters).values([{ projectId, number: 1, title: 'Chapter 1', status: 'done' as const }]);

    const rendered = await catalog.render(projectId);
    expect(rendered).not.toContain('omitted');
    expect(rendered).toContain('Chapter 1');
  });

  it('caps catalog entities, keeping major entities over minor ones, and reports the omitted count', async () => {
    const projectId = await seedProject(`catalog-caps-entities-${Date.now()}`);
    const majorCount = 3;
    const minorCount = 150;
    await db
      .insert(schema.entities)
      .values([
        ...Array.from({ length: majorCount }, (_, i) => ({ projectId, entityKey: `major_${i}`, type: 'character' as const, name: `Major ${i}`, significance: 'major' as const })),
        ...Array.from({ length: minorCount }, (_, i) => ({ projectId, entityKey: `minor_${i}`, type: 'character' as const, name: `Minor ${i}`, significance: 'minor' as const })),
      ]);

    const rendered = await catalog.render(projectId);
    expect(rendered).toContain('(+3 minor entities omitted)');
    for (let i = 0; i < majorCount; i++) expect(rendered).toContain(`major_${i}`);
  });
});
