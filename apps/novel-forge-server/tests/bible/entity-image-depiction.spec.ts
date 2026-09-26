import { describe, expect, it, mock } from 'bun:test';

import { EntityService } from '@modules/bible/entity/entity.service';

const FRONTIER = 12;

function fixture(entity: Record<string, unknown> = {}) {
  const writes: Record<string, unknown>[] = [];
  const row = { id: 7n, projectId: 1n, entityKey: 'hero', imagePath: 'old.png', imageDepictsChapter: null, images: [{ id: 3n, imagePath: 'g.png', sortOrder: 0 }], ...entity };
  const db = {
    query: {
      entities: { findFirst: mock(async () => row) },
      chapters: { findFirst: mock(async () => ({ number: FRONTIER })) },
    },
    insert: mock(() => ({
      values: async (values: Record<string, unknown>) => {
        writes.push(values);
      },
    })),
    update: mock(() => ({
      set: (values: Record<string, unknown>) => {
        writes.push(values);
        const where = { returning: async () => [{ ...row, ...values }] };
        return { where: () => Object.assign(Promise.resolve(), where) };
      },
    })),
  };
  const storage = { save: mock(async () => 'new.png'), getPublicUrl: () => undefined };
  return { service: new EntityService({ getPostgresClient: () => db } as never, storage as never), writes, storage };
}

const IMAGE = Buffer.from('png').toString('base64');

describe('EntityService — dated images', () => {
  it('should date an uploaded portrait at the chapter asked for', async () => {
    const { service, writes } = fixture();

    await service.setImage(1n, 'hero', IMAGE, 'image/png', 4);

    expect(writes[0]).toMatchObject({ imagePath: 'new.png', imageDepictsChapter: 4 });
  });

  it('should stamp an undated upload with the latest final chapter', async () => {
    const { service, writes } = fixture();

    await service.addImage(1n, 'hero', IMAGE, 'image/png', 'At the ferry');

    expect(writes[0]).toMatchObject({ imagePath: 'new.png', caption: 'At the ferry', depictsChapter: FRONTIER });
  });

  it('should keep an upload dated past the latest final chapter at that chapter, so it stays withheld until it publishes', async () => {
    const { service, writes } = fixture();

    await service.addImage(1n, 'hero', IMAGE, 'image/png', undefined, FRONTIER + 10);

    expect(writes[0]).toMatchObject({ depictsChapter: FRONTIER + 10 });
  });

  it('should re-date the portrait and a gallery image', async () => {
    const { service, writes } = fixture();

    await service.datePortrait(1n, 'hero', 2);
    await service.dateImage(1n, 'hero', 3n, 6);

    expect(writes).toMatchObject([{ imageDepictsChapter: 2 }, { depictsChapter: 6 }]);
  });

  it('should refuse to date a portrait the entity does not have', async () => {
    const { service } = fixture({ imagePath: null });

    await expect(service.datePortrait(1n, 'hero', 2)).rejects.toMatchObject({ code: 'ENT_002' });
  });

  it('should refuse to date a gallery image the entity does not have', async () => {
    const { service } = fixture();

    await expect(service.dateImage(1n, 'hero', 99n, 2)).rejects.toMatchObject({ code: 'ENT_002' });
  });
});
