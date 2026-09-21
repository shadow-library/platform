import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

import { ChapterService } from '@modules/source/chapter/chapter.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    return err instanceof AppError ? err.code : String(err);
  }
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_source_chapter_update`;

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

describe.if(pgAvailable)('ChapterService.update', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seed(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `src-upd-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.chapters).values({ projectId: project.id, number: 1, title: 'Old Title', content: 'Old prose.', wordCount: 2, status: 'done' });
    return project.id;
  }

  it('should sanitize content and title written through the source chapter PATCH path', async () => {
    const projectId = await seed();
    const service = new ChapterService({ getPostgresClient: () => db } as never);

    const row = await service.update(projectId, 1, {
      title: 'Chapter <script>alert(1)</script>',
      content: 'Prose **bold** with a raw <img src=x onerror=alert(1)> tag and a `<div>` in code.',
    });

    expect(row.content).not.toContain('<img');
    expect(row.content).toContain('&lt;img');
    expect(row.content).toContain('**bold**');
    expect(row.content).toContain('`<div>`');
    expect(row.title).not.toContain('<script>');
    expect(row.title).toContain('&lt;script&gt;');
  });
});

describe.if(pgAvailable)('ChapterService — locked chapters refuse PATCH/DELETE', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(`${dbName}_locked`);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedChapter(locked: boolean): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `src-locked-${locked}-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    await db.insert(schema.chapters).values({ projectId: project.id, number: 1, title: 'Finalized', content: 'Canon prose.', wordCount: 2, status: 'done', locked });
    return project.id;
  }

  it('should refuse to update a locked chapter (CHP_008)', async () => {
    const projectId = await seedChapter(true);
    const service = new ChapterService({ getPostgresClient: () => db } as never);

    expect(await codeOf(service.update(projectId, 1, { content: 'Attempted overwrite.' }))).toBe('CHP_008');
    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    expect(chapter?.content).toBe('Canon prose.');
  });

  it('should refuse to delete a locked chapter (CHP_008)', async () => {
    const projectId = await seedChapter(true);
    const service = new ChapterService({ getPostgresClient: () => db } as never);

    expect(await codeOf(service.delete(projectId, 1))).toBe('CHP_008');
    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    expect(chapter).toBeDefined();
  });

  it('should still allow updating an unlocked chapter', async () => {
    const projectId = await seedChapter(false);
    const service = new ChapterService({ getPostgresClient: () => db } as never);

    const row = await service.update(projectId, 1, { content: 'Edited prose.' });
    expect(row.content).toBe('Edited prose.');
  });

  it('should still allow deleting an unlocked chapter', async () => {
    const projectId = await seedChapter(false);
    const service = new ChapterService({ getPostgresClient: () => db } as never);

    await service.delete(projectId, 1);
    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    expect(chapter).toBeUndefined();
  });

  it('should still 404 for a chapter that does not exist (CHP_001)', async () => {
    const projectId = await seedChapter(false);
    const service = new ChapterService({ getPostgresClient: () => db } as never);

    expect(await codeOf(service.update(projectId, 99, { content: 'nope' }))).toBe('CHP_001');
    expect(await codeOf(service.delete(projectId, 99))).toBe('CHP_001');
  });
});
