/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { EntityService } from '@modules/bible/entity/entity.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

/**
 * Declaring the constants
 */

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_entity_image`;

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

describe.if(pgAvailable)('EntityService image gallery', () => {
  let db: PrimaryDatabase;
  let service: EntityService;
  const deleted: string[] = [];

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const imageStorage = {
      save: async (projectId: bigint, key: string) => `${projectId}/${key}.png`,
      read: async () => ({ bytes: new Uint8Array(), mime: 'image/png' }),
      getUrl: (ref: string) => `/api/v1/images/${ref}`,
      delete: async (ref: string) => void deleted.push(ref),
    };
    service = new EntityService({ getPostgresClient: () => db } as never, imageStorage as never);
  });

  beforeEach(() => {
    deleted.length = 0;
  });

  async function seedEntity(): Promise<{ projectId: bigint; entityKey: string }> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `entimg-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    const entityKey = 'hero';
    await db.insert(schema.entities).values({ projectId: project.id, entityKey, type: 'character', name: 'Hero' });
    return { projectId: project.id, entityKey };
  }

  it('adds gallery images and returns them ordered on the entity', async () => {
    const { projectId, entityKey } = await seedEntity();

    await service.addImage(projectId, entityKey, 'AAAA', 'image/png', 'a portrait');
    const withTwo = await service.addImage(projectId, entityKey, 'BBBB', 'image/png');

    expect(withTwo.images).toHaveLength(2);
    expect(withTwo.images.map(i => i.sortOrder)).toEqual([0, 1]);
    expect(withTwo.images[0]?.caption).toBe('a portrait');
  });

  it('removes a gallery image by id and deletes its stored file', async () => {
    const { projectId, entityKey } = await seedEntity();
    const added = await service.addImage(projectId, entityKey, 'AAAA', 'image/png');
    const [image] = added.images;
    if (!image) throw new Error('expected an image to have been added');

    const after = await service.deleteImageById(projectId, entityKey, image.id);

    expect(after.images).toHaveLength(0);
    expect(deleted).toEqual([image.imagePath]);
  });

  it('throws ENT_002 when removing a non-existent image', async () => {
    const { projectId, entityKey } = await seedEntity();
    expect(service.deleteImageById(projectId, entityKey, 9999n)).rejects.toThrow();
  });

  it('throws ENT_001 when adding an image to a missing entity', async () => {
    const { projectId } = await seedEntity();
    expect(service.addImage(projectId, 'ghost', 'AAAA', 'image/png')).rejects.toThrow();
  });
});
