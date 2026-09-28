import { describe, expect, it } from 'bun:test';

import { EntityService } from '@modules/bible/entity/entity.service';

const IMAGE = Buffer.from('png').toString('base64');

function fixture(entity: Record<string, unknown> | undefined) {
  const saved: Uint8Array[] = [];
  const db = {
    query: {
      entities: { findFirst: async () => entity },
      chapters: { findFirst: async () => ({ number: 3 }) },
    },
    insert: () => ({ values: async () => undefined }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: () => ({ returning: async () => [{ ...entity, ...values }] }) }) }),
  };
  const storage = {
    save: async (bytes: Uint8Array) => {
      saved.push(bytes);
      return 'new.png';
    },
    getPublicUrl: () => undefined,
  };
  return { service: new EntityService({ getPostgresClient: () => db } as never, storage as never), saved };
}

describe('EntityService — image uploads', () => {
  it('should refuse a portrait for an unknown entity without storing the image', async () => {
    const { service, saved } = fixture(undefined);

    await expect(service.setImage(1n, 'ghost', IMAGE, 'image/png')).rejects.toMatchObject({ code: 'ENT_001' });
    expect(saved).toEqual([]);
  });

  it('should refuse a gallery image for an unknown entity without storing the image', async () => {
    const { service, saved } = fixture(undefined);

    await expect(service.addImage(1n, 'ghost', IMAGE, 'image/png')).rejects.toMatchObject({ code: 'ENT_001' });
    expect(saved).toEqual([]);
  });

  it('should store the image for an entity that exists', async () => {
    const { service, saved } = fixture({ id: 7n, projectId: 1n, entityKey: 'hero', imagePath: null, images: [] });

    await service.setImage(1n, 'hero', IMAGE, 'image/png');

    expect(saved).toHaveLength(1);
  });
});
