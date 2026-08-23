import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ChapterImageService } from '@modules/generation/chapter-image.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_chapter_image`;

// Any absolute origin will do — the service under test only concatenates it, and asserting on it keeps
// the ref → URL mapping visible in the expectations.
const TEST_STORAGE_ORIGIN = 'https://storage.test';

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

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    // Stub the shared StorageService with a content-addressed save plus the public-URL resolution the
    // service presents refs through; it no longer reads/deletes here.
    const storage = {
      save: async (bytes: Uint8Array) => {
        const ref = `${Buffer.from(bytes).toString('hex') || 'empty'}.png`;
        saved.push(ref);
        return ref;
      },
      getPublicUrl: (ref?: string | null) => (ref ? `${TEST_STORAGE_ORIGIN}/${ref}` : undefined),
    };
    service = new ChapterImageService({ getPostgresClient: () => db } as never, storage as never);
  });

  beforeEach(() => {
    saved.length = 0;
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

  // The web app renders `imageUrl` verbatim. Presenting the bare ref instead once shipped an image
  // pointing at the client bundle's baked-in dev origin, so both routes must resolve it server-side.
  it('should present an absolute public URL rather than the stored ref', async () => {
    const projectId = await seedProject();

    const added = await service.add(projectId, 1, 'AAAA', 'image/png');
    const [listed] = await service.list(projectId, 1);

    expect(added.imageUrl).toBe(`${TEST_STORAGE_ORIGIN}/${added.imagePath}`);
    expect(listed?.imageUrl).toBe(`${TEST_STORAGE_ORIGIN}/${added.imagePath}`);
  });

  it('removes an image row', async () => {
    const projectId = await seedProject();
    const img = await service.add(projectId, 1, 'AAAA', 'image/png');

    await service.remove(projectId, 1, img.id);

    expect(await service.list(projectId, 1)).toHaveLength(0);
  });

  it('throws when removing a non-existent image', async () => {
    const projectId = await seedProject();
    expect(service.remove(projectId, 1, 9999n)).rejects.toThrow();
  });

  it('should purge only the deleted chapter’s images on onChapterDeleted', async () => {
    const projectId = await seedProject();
    await service.add(projectId, 1, 'AAAA', 'image/png');
    const kept = await service.add(projectId, 2, 'BBBB', 'image/png');

    await service.onChapterDeleted(projectId, 1);

    expect(await service.list(projectId, 1)).toHaveLength(0);
    expect(await service.list(projectId, 2)).toEqual([expect.objectContaining({ id: kept.id, chapter: 2 })]);
  });
});
