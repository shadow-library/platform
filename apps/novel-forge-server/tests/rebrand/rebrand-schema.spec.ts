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
const dbName = `${baseConnectionString.split('/').pop()}_rebrand_schema`;

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

describe.if(pgAvailable)('rebrand schemas', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `rebrand-${Date.now()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should default rebrand columns and enforce one rebrand per project', async () => {
    const [rebrand] = await db.insert(schema.rebrands).values({ projectId }).returning();
    expect(rebrand).toMatchObject({ status: 'pending', directives: null, worldNotes: null, settings: null, lastError: null });

    const duplicate = db.insert(schema.rebrands).values({ projectId }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/rebrands_project_id_unique/);
  });

  it('should keep the existing glossary mapping on conflicting source names', async () => {
    const entry = { projectId, sourceName: 'Ye Fan', replacement: 'Evan Vale', category: 'character' as const, variants: ['Yefan'], createdChapter: 0 };
    await db.insert(schema.rebrandGlossary).values(entry);

    await db
      .insert(schema.rebrandGlossary)
      .values({ ...entry, replacement: 'Someone Else', createdChapter: 7 })
      .onConflictDoNothing();

    const [row] = await db.select().from(schema.rebrandGlossary).where(eq(schema.rebrandGlossary.projectId, projectId));
    expect(row).toMatchObject({ sourceName: 'Ye Fan', replacement: 'Evan Vale', variants: ['Yefan'], createdChapter: 0 });
  });

  it('should upsert a conversion by chapter and bump its revision', async () => {
    const [first] = await db.insert(schema.chapterConversions).values({ projectId, chapter: 1, title: 'The Vale Gate', body: 'converted prose', status: 'converted' }).returning();
    expect(first).toMatchObject({ revision: 1, issues: null, carryState: null });

    const [second] = await db
      .insert(schema.chapterConversions)
      .values({ projectId, chapter: 1, title: 'The Vale Gate (repaired)', body: 'better prose', status: 'attention', issues: [{ source: 'residue', type: 'cjk' }] })
      .onConflictDoUpdate({
        target: [schema.chapterConversions.projectId, schema.chapterConversions.chapter],
        set: {
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          status: sql`excluded.status`,
          issues: sql`excluded.issues`,
          revision: sql`${schema.chapterConversions.revision} + 1`,
        },
      })
      .returning();
    expect(second).toMatchObject({ id: first?.id, revision: 2, status: 'attention', body: 'better prose' });
  });

  it('should cascade rebrand rows when the project is deleted', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `rebrand-cascade-${Date.now()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.rebrands).values({ projectId: project.id });
    await db.insert(schema.rebrandGlossary).values({ projectId: project.id, sourceName: 'Huaxia', replacement: 'Veldram', category: 'country' });
    await db.insert(schema.chapterConversions).values({ projectId: project.id, chapter: 1, body: '', status: 'failed' });

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));

    expect(await db.select().from(schema.rebrands).where(eq(schema.rebrands.projectId, project.id))).toHaveLength(0);
    expect(await db.select().from(schema.rebrandGlossary).where(eq(schema.rebrandGlossary.projectId, project.id))).toHaveLength(0);
    expect(await db.select().from(schema.chapterConversions).where(eq(schema.chapterConversions.projectId, project.id))).toHaveLength(0);
  });
});
