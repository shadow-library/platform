import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sql';

import { EntityService } from '@modules/bible/entity/entity.service';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_entity_image`;

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

describe.if(pgAvailable)('EntityService image gallery', () => {
  let db: PrimaryDatabase;
  let service: EntityService;

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    // Stub the shared StorageService with a content-addressed save plus the public-URL resolution the
    // service presents refs through; it no longer reads/deletes here.
    const storage = {
      save: async (bytes: Uint8Array) => `${Buffer.from(bytes).toString('hex') || 'empty'}.png`,
      getPublicUrl: (ref?: string | null) => (ref ? `${TEST_STORAGE_ORIGIN}/${ref}` : undefined),
    };
    service = new EntityService({ getPostgresClient: () => db } as never, storage as never);
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

  // The web app renders these URLs verbatim. Presenting bare refs instead once shipped images pointing at
  // the client bundle's baked-in dev origin, so the portrait and every gallery entry resolve server-side.
  it('should present absolute public URLs rather than the stored refs', async () => {
    const { projectId, entityKey } = await seedEntity();

    const portrait = await service.setImage(projectId, entityKey, 'AAAA', 'image/png');
    const withGallery = await service.addImage(projectId, entityKey, 'BBBB', 'image/png');

    expect(portrait.imageUrl).toBe(`${TEST_STORAGE_ORIGIN}/${portrait.imagePath}`);
    expect(withGallery.imageUrl).toBe(`${TEST_STORAGE_ORIGIN}/${portrait.imagePath}`);
    expect(withGallery.images[0]?.imageUrl).toBe(`${TEST_STORAGE_ORIGIN}/${withGallery.images[0]?.imagePath}`);
  });

  it('should present no portrait URL when the entity has no image', async () => {
    const { projectId, entityKey } = await seedEntity();

    const cleared = await service.clearImage(projectId, entityKey);

    expect(cleared.imageUrl).toBeUndefined();
  });

  it('removes a gallery image by id', async () => {
    const { projectId, entityKey } = await seedEntity();
    const added = await service.addImage(projectId, entityKey, 'AAAA', 'image/png');
    const [image] = added.images;
    if (!image) throw new Error('expected an image to have been added');

    const after = await service.deleteImageById(projectId, entityKey, image.id);

    expect(after.images).toHaveLength(0);
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
