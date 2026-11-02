import { describe, expect, it } from 'bun:test';
import { unzipSync } from 'fflate';

import { NovelPackageService } from '@modules/export/novel-package.service';
import { schema } from '@server/database';

const characters = [
  { id: 1n, entityKey: 'ada', name: 'Ada', imagePath: 'img/ada', notes: null, motivation: null },
  { id: 2n, entityKey: 'bram', name: 'Bram', imagePath: null, notes: null, motivation: null },
  { id: 3n, entityKey: 'cole', name: 'Cole', imagePath: null, notes: null, motivation: null },
];

const selected = new Map<unknown, unknown[]>([
  [schema.chapters, [{ number: 1, title: 'Arrival', content: 'The harbour wakes.' }]],
  [
    schema.entityImages,
    [
      { entityId: 1n, imagePath: 'img/ada-2', caption: 'older' },
      { entityId: 2n, imagePath: 'img/bram-1', caption: null },
      { entityId: 2n, imagePath: 'img/bram-2', caption: 'storm' },
    ],
  ],
]);

/** `select().from(table).where().orderBy()` answered per table, each statement's table recorded. */
function service() {
  const reads: unknown[] = [];
  const db = {
    query: {
      projects: { findFirst: async () => ({ id: 7n, name: 'harbour', title: 'The Harbour Keeper', themes: [], coverImagePath: null }) },
      entities: { findMany: async () => characters },
    },
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          orderBy: async () => {
            reads.push(table);
            return selected.get(table) ?? [];
          },
        }),
      }),
    }),
  };
  const storage = { read: async (ref: string) => ({ bytes: new TextEncoder().encode(ref), contentType: 'image/png' }) };
  return { packages: new NovelPackageService({ getPostgresClient: () => db } as never, storage as never), reads };
}

describe('NovelPackageService.build', () => {
  it('should read every character gallery in one query and keep each gallery with its character', async () => {
    const { packages, reads } = service();

    const built = await packages.build(7n);

    const manifest = JSON.parse(new TextDecoder().decode(unzipSync(built.bytes)['manifest.json'])) as {
      characters: { name: string; image?: string; variants?: { image: string; label?: string }[] }[];
    };
    expect(manifest.characters).toEqual([
      { name: 'Ada', image: 'images/characters/ada.png', variants: [{ image: 'images/characters/ada-v1.png', label: 'older' }] },
      { name: 'Bram', variants: [{ image: 'images/characters/bram-v1.png' }, { image: 'images/characters/bram-v2.png', label: 'storm' }] },
    ]);
    expect(reads.filter(table => table === schema.entityImages)).toHaveLength(1);
  });
});
