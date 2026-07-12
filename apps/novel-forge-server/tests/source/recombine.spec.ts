/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { SQL } from 'bun';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { RecombineService } from '@modules/source';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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
    service = new RecombineService({ getPostgresClient: () => db } as never);
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(options: { scrapeComplete?: boolean; kind?: 'source' | 'new_novel' } = {}): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `recombine-${Date.now()}-${Math.random()}`, kind: options.kind ?? 'source', scrapeComplete: options.scrapeComplete ?? true, scrapeNextNumber: 7 })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.chapters).values(FIXTURE.map(f => ({ projectId: project.id, ...f, status: 'done' as const })));
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
      { number: 2, title: 'Chapter 2 - The Gate (1/2)', words: 5, url: null },
      { number: 3, title: 'Chapter 2 - The Gate (2/2)', words: 5, url: null },
    ]);

    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(project?.scrapeNextNumber).toBe(5);
  });

  it('should be a no-op on a second run', async () => {
    const projectId = await seedProject();
    await service.recombine(projectId);

    const second = await service.recombine(projectId);
    expect(second).toMatchObject({ applied: false, before: 4, after: 4, merged: [] });
  });

  it('should plan without writing in dry-run mode, even mid-scrape', async () => {
    const projectId = await seedProject({ scrapeComplete: false });

    const result = await service.recombine(projectId, { dryRun: true });
    expect(result).toMatchObject({ applied: false, before: 6, after: 4 });

    const rows = await db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId) });
    expect(rows).toHaveLength(6);
  });

  it('should enforce the scrape-complete and derived-data guards', async () => {
    const midScrape = await seedProject({ scrapeComplete: false });
    expect(service.recombine(midScrape)).rejects.toThrow(/completed scrape/);

    const extracted = await seedProject();
    await db.insert(schema.briefs).values({ projectId: extracted, chapter: 1, body: 'brief body' });
    expect(service.recombine(extracted)).rejects.toThrow(/renumbering would corrupt/);

    const novel = await seedProject({ kind: 'new_novel' });
    expect(service.recombine(novel)).rejects.toThrow(/not valid for this project kind/);
  });

  it('should log-and-skip guard violations in autoRecombine', async () => {
    const midScrape = await seedProject({ scrapeComplete: false });
    expect(await service.autoRecombine(midScrape)).toBeNull();
  });
});
