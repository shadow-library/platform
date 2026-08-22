import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_character_states_schema`;

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

async function violatedConstraint(query: Promise<unknown>): Promise<string> {
  const error = await query.then(
    () => null,
    (e: Error) => e,
  );
  if (!error) throw new Error('expected query to be rejected');
  return String(error.cause ?? error.message);
}

describe.if(pgAvailable)('character_states schema', () => {
  let db: PrimaryDatabase;
  let projectId: bigint;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `character-states-${Date.now()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should insert and round-trip a character state row', async () => {
    const [state] = await db
      .insert(schema.characterStates)
      .values({
        projectId,
        entityKey: 'hero',
        location: 'the vale gate',
        conditions: ['wounded', 'exhausted'],
        immediateGoal: 'reach the sanctuary before nightfall',
        statusNote: 'has lost the sword',
        lastUpdatedChapter: 12,
      })
      .returning();

    expect(state).toMatchObject({
      projectId,
      entityKey: 'hero',
      location: 'the vale gate',
      conditions: ['wounded', 'exhausted'],
      immediateGoal: 'reach the sanctuary before nightfall',
      statusNote: 'has lost the sword',
      lastUpdatedChapter: 12,
    });
  });

  it('should enforce one current state row per project/entity', async () => {
    await db.insert(schema.characterStates).values({ projectId, entityKey: 'villain', lastUpdatedChapter: 1 });
    const duplicate = db.insert(schema.characterStates).values({ projectId, entityKey: 'villain', lastUpdatedChapter: 2 }).execute();
    expect(await violatedConstraint(duplicate)).toMatch(/character_states_project_id_entity_key_unique/);
  });

  it('should replace statusNote on upsert rather than append', async () => {
    await db.insert(schema.characterStates).values({ projectId, entityKey: 'sidekick', statusNote: 'first note', lastUpdatedChapter: 1 });
    const [updated] = await db
      .insert(schema.characterStates)
      .values({ projectId, entityKey: 'sidekick', statusNote: 'second note', lastUpdatedChapter: 2 })
      .onConflictDoUpdate({
        target: [schema.characterStates.projectId, schema.characterStates.entityKey],
        set: { statusNote: 'second note', lastUpdatedChapter: 2 },
      })
      .returning();
    expect(updated).toMatchObject({ statusNote: 'second note', lastUpdatedChapter: 2 });
  });

  it('should cascade character state rows when the project is deleted', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `character-states-cascade-${Date.now()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.characterStates).values({ projectId: project.id, entityKey: 'npc', lastUpdatedChapter: 1 });

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));

    expect(await db.select().from(schema.characterStates).where(eq(schema.characterStates.projectId, project.id))).toHaveLength(0);
  });
});
