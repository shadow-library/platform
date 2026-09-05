import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ChapterService } from '@modules/source/chapter/chapter.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

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
