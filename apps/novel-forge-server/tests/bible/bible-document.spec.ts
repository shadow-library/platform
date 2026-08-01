/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { BibleDocumentService } from '@modules/bible/document/bible-document.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_bible_doc`;

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

describe.if(pgAvailable)('BibleDocumentService versioning + invalidation', () => {
  let db: PrimaryDatabase;

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());
  let service: BibleDocumentService;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    service = new BibleDocumentService({ getPostgresClient: () => db } as never);
  });

  async function seed(): Promise<{ projectId: bigint }> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `bible-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.chapters).values({ projectId: project.id, number: 1, content: 'ch1', status: 'done', locked: true });
    return { projectId: project.id };
  }

  async function chapterFlag(projectId: bigint): Promise<boolean> {
    const ch = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    return ch?.needsRevalidation ?? false;
  }

  it('bumps revision only when content changes and flags dependent chapters on change', async () => {
    const { projectId } = await seed();

    const v1 = await service.upsert(projectId, 'world', 'magic', { body: 'Fire magic exists.' });
    expect(v1.revision).toBe(1);
    expect(v1.contentHash).toBeTruthy();
    expect(await chapterFlag(projectId)).toBe(true); // new canon invalidates existing chapters

    // Reset the flag, then re-upsert identical content: no revision bump, no re-invalidation.
    await db.update(schema.chapters).set({ needsRevalidation: false }).where(eq(schema.chapters.projectId, projectId));
    const same = await service.upsert(projectId, 'world', 'magic', { body: 'Fire magic exists.' });
    expect(same.revision).toBe(1);
    expect(await chapterFlag(projectId)).toBe(false);

    // Changed content: revision bumps and chapters are flagged again.
    const v2 = await service.upsert(projectId, 'world', 'magic', { body: 'Fire magic was outlawed.' });
    expect(v2.revision).toBe(2);
    expect(await chapterFlag(projectId)).toBe(true);
  });
});
