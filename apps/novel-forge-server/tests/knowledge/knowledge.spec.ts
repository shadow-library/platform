/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { beforeAll, describe, expect, it } from 'bun:test';

import { SQL } from 'bun';

/**
 * Importing user defined packages
 */
import { KnowledgeRepository } from '@modules/extraction';
import { type PrimaryDatabase, schema } from '@server/database';
import { TestEnvironment } from '@tests/test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge');
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

const testEnv = new TestEnvironment('knowledge_test');

describe.if(pgAvailable)('KnowledgeRepository', () => {
  testEnv.init();

  let repo: KnowledgeRepository;
  let db: PrimaryDatabase;

  beforeAll(() => {
    repo = testEnv.getService(KnowledgeRepository);
    db = testEnv.getPostgresClient();
  });

  async function createProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `project-${Date.now()}-${Math.random()}`, kind: 'source' })
      .returning();
    if (!project) throw new Error('failed to create test project');
    return project.id;
  }

  it('upsertEntity creates on first call and merges attributes on conflict', async () => {
    const projectId = await createProject();

    const first = await repo.upsertEntity(projectId, { entityKey: 'hero', type: 'character', name: 'Hero', attributes: { power: 'fire' } });
    expect(first.entityKey).toBe('hero');
    expect(first.attributes).toMatchObject({ power: 'fire' });

    const second = await repo.upsertEntity(projectId, { entityKey: 'hero', type: 'character', name: 'Hero', attributes: { rank: 'S' } });
    expect(second.id).toBe(first.id);
    expect(second.attributes).toMatchObject({ power: 'fire', rank: 'S' });
  });

  it('upsertEntity keeps the minimum firstSeenChapter on conflict', async () => {
    const projectId = await createProject();

    await repo.upsertEntity(projectId, { entityKey: 'villain', type: 'character', name: 'Villain', firstSeenChapter: 10 });
    const updated = await repo.upsertEntity(projectId, { entityKey: 'villain', type: 'character', name: 'Villain', firstSeenChapter: 5 });
    expect(updated.firstSeenChapter).toBe(5);

    const notDowngraded = await repo.upsertEntity(projectId, { entityKey: 'villain', type: 'character', name: 'Villain', firstSeenChapter: 20 });
    expect(notDowngraded.firstSeenChapter).toBe(5);
  });

  it('addAppearance is insert-or-ignore on duplicate', async () => {
    const projectId = await createProject();
    const entity = await repo.upsertEntity(projectId, { entityKey: 'npc', type: 'character', name: 'NPC' });

    await repo.addAppearance({ entityId: entity.id, projectId, chapter: 1 });
    await repo.addAppearance({ entityId: entity.id, projectId, chapter: 1 }); // duplicate — should not throw

    const rows = await db.query.entityAppearances.findMany({ where: (t, { and, eq }) => and(eq(t.entityId, entity.id), eq(t.chapter, 1)) });
    expect(rows.length).toBe(1);
  });

  it('upsertPlotThread keeps the first openedChapter and takes the latest closedChapter', async () => {
    const projectId = await createProject();

    await repo.upsertPlotThread(projectId, { threadKey: 'arc-1', status: 'open', openedChapter: 3, closedChapter: undefined });
    const updated = await repo.upsertPlotThread(projectId, { threadKey: 'arc-1', status: 'closed', openedChapter: 10, closedChapter: 20 });

    // openedChapter keeps the first value (3), not overwritten by 10
    expect(updated.openedChapter).toBe(3);
    // closedChapter takes EXCLUDED value when provided
    expect(updated.closedChapter).toBe(20);
  });

  it('workSummary returns all zeros for a project with no jobs', async () => {
    const projectId = await createProject();
    const summary = await repo.workSummary(projectId);
    expect(summary).toEqual({ pending: 0, inProgress: 0, done: 0, failed: 0, parked: 0 });
  });

  it('corpusStats returns zero counts for a fresh project', async () => {
    const projectId = await createProject();
    const stats = await repo.corpusStats(projectId);
    expect(stats).toEqual({ chaptersTotal: 0, chaptersExtracted: 0, entitiesTotal: 0, draftsTotal: 0, draftsFinal: 0, volumesTotal: 0 });
  });
});
