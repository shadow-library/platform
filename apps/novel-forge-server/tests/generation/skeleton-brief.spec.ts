import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { SkeletonService } from '@modules/planning/skeleton.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_skeleton_brief`;

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

describe.if(pgAvailable)('skeleton generation reads the project brief and premise', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  function buildService(): { service: SkeletonService; structured: ReturnType<typeof mock> } {
    const structured = mock(async () => ({ characterArcs: [], powerCurve: 'flat' }));
    const service = new SkeletonService({ getPostgresClient: () => db } as never, { structured } as never);
    return { service, structured };
  }

  it("should feed the project's brief and premise into the skeleton prompt alongside entities and chapter summaries", async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({
        name: `skeleton-${Date.now()}-${Math.random()}`,
        kind: 'new_novel',
        brief: 'A forger uncovers a conspiracy inside the guild that trained her.',
        premise: 'A story about trust, forgery, and the cost of belonging.',
      })
      .returning();
    if (!project) throw new Error('failed to seed project');

    await db.insert(schema.entities).values({ projectId: project.id, entityKey: 'amara', name: 'Amara', type: 'character', significance: 'major' });
    await db.insert(schema.chapters).values({ projectId: project.id, number: 1, content: 'ch1', summary: 'Amara forges her first seal.', status: 'done' });

    const { service, structured } = buildService();
    await service.generateSkeleton(project.id);

    expect(structured).toHaveBeenCalledTimes(1);
    const vars = structured.mock.calls[0]?.[1] as { projectBrief: string; themes: string };
    expect(vars.projectBrief).toContain('A story about trust, forgery, and the cost of belonging.');
    expect(vars.projectBrief).toContain('A forger uncovers a conspiracy inside the guild that trained her.');
    expect(vars.projectBrief).toContain('Amara (character, major)');
    expect(vars.projectBrief).toContain('Chapter 1: Amara forges her first seal.');
  });

  it('should still work when the project has no brief or premise set', async () => {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `skeleton-bare-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');

    const { service, structured } = buildService();
    await service.generateSkeleton(project.id);

    expect(structured).toHaveBeenCalledTimes(1);
    const vars = structured.mock.calls[0]?.[1] as { projectBrief: string };
    expect(vars.projectBrief).toBe('');
  });
});
