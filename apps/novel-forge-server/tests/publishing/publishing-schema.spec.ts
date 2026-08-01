/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
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
const dbName = `${baseConnectionString.split('/').pop()}_publishing_schema`;

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

// Drizzle wraps constraint violations in a "Failed query" error; the violated constraint's name only
// appears on the underlying driver error in `cause`.
async function violatedConstraint(query: Promise<unknown>): Promise<string> {
  const error = await query.then(
    () => null,
    (e: Error) => e,
  );
  if (!error) throw new Error('expected query to be rejected');
  return String(error.cause ?? error.message);
}

describe.if(pgAvailable)('publishing schemas', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `publishing-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should default publication columns and enforce one publication per project', async () => {
    const [publication] = await db.insert(schema.publications).values({ projectId, novelSlug: 'ashes-of-veldram', title: 'Ashes of Veldram' }).returning();
    expect(publication).toMatchObject({ status: 'draft', revision: 1, blurb: null, coverPath: null, genres: null });

    const duplicate = db.insert(schema.publications).values({ projectId, novelSlug: 'other-slug', title: 'Other' }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/publications_project_id_unique/);
  });

  it('should enforce a globally unique novel slug', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `publishing-slug-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');

    const duplicate = db.insert(schema.publications).values({ projectId: project.id, novelSlug: 'ashes-of-veldram', title: 'Copycat' }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/publications_novel_slug_unique/);
  });

  it('should default ledger columns and enforce a unique published ordinal per project', async () => {
    const [row] = await db.insert(schema.chapterPublications).values({ projectId, chapter: 1, publishedOrdinal: 1, title: 'The Vale Gate', contentHash: 'hash-1' }).returning();
    expect(row).toMatchObject({ status: 'scheduled', revision: 1, authorNote: null, scheduledAt: null, publishedAt: null, error: null });

    const duplicate = db.insert(schema.chapterPublications).values({ projectId, chapter: 2, publishedOrdinal: 1, title: 'Duplicate', contentHash: 'hash-2' }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/chapter_publications_project_id_published_ordinal_unique/);
  });

  it('should bump a ledger revision on republish without disturbing the ordinal', async () => {
    const [updated] = await db
      .update(schema.chapterPublications)
      .set({ contentHash: 'hash-1b', revision: sql`${schema.chapterPublications.revision} + 1`, status: 'scheduled' })
      .where(eq(schema.chapterPublications.projectId, projectId))
      .returning();
    expect(updated).toMatchObject({ publishedOrdinal: 1, revision: 2, contentHash: 'hash-1b' });
  });

  it('should cascade publication rows when the project is deleted', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `publishing-cascade-${Date.now()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.publications).values({ projectId: project.id, novelSlug: 'cascade-novel', title: 'Cascade' });
    await db.insert(schema.chapterPublications).values({ projectId: project.id, chapter: 1, publishedOrdinal: 1, title: 'Gone', contentHash: 'hash' });

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));

    expect(await db.select().from(schema.publications).where(eq(schema.publications.projectId, project.id))).toHaveLength(0);
    expect(await db.select().from(schema.chapterPublications).where(eq(schema.chapterPublications.projectId, project.id))).toHaveLength(0);
  });
});
