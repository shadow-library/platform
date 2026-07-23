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
const dbName = `${baseConnectionString.split('/').pop()}_reforge_schema`;

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

describe.if(pgAvailable)('reforge schemas', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `reforge-${Date.now()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should default reforge columns and enforce one reforge per project', async () => {
    const [reforge] = await db.insert(schema.reforges).values({ projectId }).returning();
    expect(reforge).toMatchObject({ status: 'pending', instructions: null, fidelity: 'preserve', settings: null, lastError: null });

    const duplicate = db.insert(schema.reforges).values({ projectId }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/reforges_project_id_unique/);
  });

  it('should upsert a reforge by chapter and bump its revision', async () => {
    const [first] = await db
      .insert(schema.chapterReforges)
      .values({ projectId, chapter: 1, title: 'The Vale Gate', body: 'reforged prose', status: 'reforged', wordCount: 2 })
      .returning();
    expect(first).toMatchObject({ revision: 1, issues: null, carryState: null, sourceBeats: null });

    const [second] = await db
      .insert(schema.chapterReforges)
      .values({ projectId, chapter: 1, title: 'The Vale Gate (repaired)', body: 'better prose', status: 'attention', issues: [{ source: 'fidelity', type: 'missing_beat' }] })
      .onConflictDoUpdate({
        target: [schema.chapterReforges.projectId, schema.chapterReforges.chapter],
        set: {
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          status: sql`excluded.status`,
          issues: sql`excluded.issues`,
          revision: sql`${schema.chapterReforges.revision} + 1`,
        },
      })
      .returning();
    expect(second).toMatchObject({ id: first?.id, revision: 2, status: 'attention', body: 'better prose' });
  });

  it('should reject an invalid fidelity value', async () => {
    const invalid = db.execute(sql`INSERT INTO reforges (project_id, fidelity) VALUES (${projectId}, 'nonsense')`);
    expect(await violatedConstraint(invalid)).toMatch(/reforge_fidelity/);
  });

  it('should cascade reforge rows when the project is deleted', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `reforge-cascade-${Date.now()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.reforges).values({ projectId: project.id, instructions: 'cut the filler arcs', fidelity: 'close' });
    await db.insert(schema.chapterReforges).values({ projectId: project.id, chapter: 1, body: '', status: 'failed' });

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));

    expect(await db.select().from(schema.reforges).where(eq(schema.reforges.projectId, project.id))).toHaveLength(0);
    expect(await db.select().from(schema.chapterReforges).where(eq(schema.chapterReforges.projectId, project.id))).toHaveLength(0);
  });
});
