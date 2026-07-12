/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { ChapterImageService } from '@modules/generation/chapter-image.service';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_chapter_image`;

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

describe.if(pgAvailable)('ChapterImageService', () => {
  let db: PrimaryDatabase;
  let service: ChapterImageService;
  const saved: string[] = [];
  const deleted: string[] = [];

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const imageStorage = {
      save: async (projectId: bigint, key: string) => {
        const ref = `${projectId}/${key}.png`;
        saved.push(ref);
        return ref;
      },
      read: async () => ({ bytes: new Uint8Array(), mime: 'image/png' }),
      getUrl: (ref: string) => `/api/v1/images/${ref}`,
      delete: async (ref: string) => void deleted.push(ref),
    };
    service = new ChapterImageService({ getPostgresClient: () => db } as never, imageStorage as never);
  });

  beforeEach(() => {
    saved.length = 0;
    deleted.length = 0;
  });

  async function seedProject(): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `chimg-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    return project.id;
  }

  it('adds images with monotonically increasing sort order and lists them in order', async () => {
    const projectId = await seedProject();

    const a = await service.add(projectId, 1, 'AAAA', 'image/png', 'first');
    const b = await service.add(projectId, 1, 'BBBB', 'image/png');
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);
    expect(a.caption).toBe('first');
    expect(saved).toHaveLength(2);

    const rows = await service.list(projectId, 1);
    expect(rows.map(r => r.id)).toEqual([a.id, b.id]);
  });

  it('removes an image and drops its stored file', async () => {
    const projectId = await seedProject();
    const img = await service.add(projectId, 1, 'AAAA', 'image/png');

    await service.remove(projectId, 1, img.id);

    expect(deleted).toEqual([img.imagePath]);
    expect(await service.list(projectId, 1)).toHaveLength(0);
  });

  it('throws when removing a non-existent image', async () => {
    const projectId = await seedProject();
    expect(service.remove(projectId, 1, 9999n)).rejects.toThrow();
  });

  it('purges the deleted chapter and shifts later chapters down on onChapterDeleted', async () => {
    const projectId = await seedProject();
    const gone = await service.add(projectId, 1, 'AAAA', 'image/png');
    const kept = await service.add(projectId, 2, 'BBBB', 'image/png');

    await service.onChapterDeleted(projectId, 1);

    expect(deleted).toEqual([gone.imagePath]);
    expect(await service.list(projectId, 1)).toEqual([expect.objectContaining({ id: kept.id, chapter: 1 })]);
    expect(await service.list(projectId, 2)).toHaveLength(0);
  });
});
