import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { landFinalChapters } from '@modules/novel-import/land-chapters';
import { type NovelBundle } from '@modules/novel-import/novel-import.dto';
import { type ImportJobPayload, NovelImportService } from '@modules/novel-import/novel-import.service';
import { schema } from '@server/database';

import { matchesWhere } from '../sql-filter';

type Row = Record<string, unknown>;

function bundle(): NovelBundle {
  return {
    format: 'novel-import',
    schemaVersion: 1,
    mode: 'final',
    novel: { title: 'The Salt Road', synopsis: 'A courier carries a sealed letter across a drowned kingdom.' },
    volumes: [
      { ordinal: 2, title: 'The Far Shore', chapters: [{ title: 'Landfall', content: 'The boat grounded.' }] },
      {
        ordinal: 1,
        title: 'The Crossing',
        chapters: [
          { title: 'The Letter', content: 'Oren took the letter.' },
          { title: 'Fog', content: 'The fog closed in.' },
        ],
      },
    ],
  };
}

function fakeImportDatabase(accountSettings: Row[] = []) {
  const inserted = new Map<unknown, Row[]>([[schema.accountSettings, [...accountSettings, { ownerKind: 'user', ownerId: 4n, defaultCostTier: 'performant' }]]]);
  const rows = (table: unknown): Row[] => inserted.get(table) ?? [];
  const insert = (table: unknown) => ({
    values: (values: Row | Row[]) => {
      const staged = (Array.isArray(values) ? values : [values]).map((row, index) =>
        table === schema.volumes ? { id: BigInt(rows(table).length + index + 1), revision: 1, state: 'not_started', contentHash: null, ...row } : row,
      );
      inserted.set(table, [...rows(table), ...staged]);
      const returned = table === schema.projects ? [{ id: 11n }] : [{ id: 'job-1' }];
      return Object.assign(Promise.resolve(), { returning: () => Object.assign(Promise.resolve(returned), { catch: () => Promise.resolve(returned) }) });
    },
  });
  const select = () => ({
    from: (table: unknown) => ({
      where: (condition: SQL) => Object.assign(Promise.resolve(rows(table).filter(row => matchesWhere(row, condition))), { for: async () => rows(table) }),
    }),
  });
  const update = (table: unknown) => ({
    set: (values: Row) => ({
      where: (condition: SQL) => {
        for (const row of rows(table).filter(row => matchesWhere(row, condition))) Object.assign(row, values);
        return Promise.resolve();
      },
    }),
  });
  const db = { $count: async () => 0, transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ insert, select, update }) };
  return { db, inserted };
}

describe('novel import — chapter volumes', () => {
  it('should stage each chapter with the key of the volume it came from, in ordinal order', async () => {
    const { db, inserted } = fakeImportDatabase();
    const actors = { current: () => ({ kind: 'user', id: 3n, organisationId: null }) };
    const service = new NovelImportService({ getPostgresClient: () => db } as never, actors as never);

    await service.import({ bundle: bundle() });

    const [job] = inserted.get(schema.jobs) ?? [];
    expect((job?.['payload'] as ImportJobPayload).chapters.map(chapter => [chapter.title, chapter.volumeKey])).toEqual([
      ['The Letter', 'volume_1'],
      ['Fog', 'volume_1'],
      ['Landfall', 'volume_2'],
    ]);
    expect((inserted.get(schema.volumes) ?? []).map(volume => volume['volumeKey'])).toEqual(['volume_1', 'volume_2']);
  });

  it('should activate volume 1, the lowest-ordinal volume a fresh import lands with none active', async () => {
    const { db, inserted } = fakeImportDatabase();
    const actors = { current: () => ({ kind: 'user', id: 3n, organisationId: null }) };
    const service = new NovelImportService({ getPostgresClient: () => db } as never, actors as never);

    await service.import({ bundle: bundle() });

    expect((inserted.get(schema.volumes) ?? []).map(volume => [volume['volumeKey'], volume['state']])).toEqual([
      ['volume_1', 'active'],
      ['volume_2', 'not_started'],
    ]);
  });

  it('should start the project on the owner’s default cost tier when the request names none', async () => {
    const { db, inserted } = fakeImportDatabase([{ ownerKind: 'user', ownerId: 3n, defaultCostTier: 'economy' }]);
    const actors = { current: () => ({ kind: 'user', id: 3n, organisationId: null }) };
    const service = new NovelImportService({ getPostgresClient: () => db } as never, actors as never);

    await service.import({ bundle: bundle() });

    expect(inserted.get(schema.projects)?.[0]?.['costTier']).toBe('economy');
  });

  it('should start the project on Balanced when the owner has no settings, and on the request’s tier when it names one', async () => {
    const bare = fakeImportDatabase();
    const explicit = fakeImportDatabase([{ ownerKind: 'user', ownerId: 3n, defaultCostTier: 'economy' }]);
    const actors = { current: () => ({ kind: 'user', id: 3n, organisationId: null }) };

    await new NovelImportService({ getPostgresClient: () => bare.db } as never, actors as never).import({ bundle: bundle() });
    await new NovelImportService({ getPostgresClient: () => explicit.db } as never, actors as never).import({ bundle: bundle(), costTier: 'performant' });

    expect(bare.inserted.get(schema.projects)?.[0]?.['costTier']).toBe('balanced');
    expect(explicit.inserted.get(schema.projects)?.[0]?.['costTier']).toBe('performant');
  });

  it('should land each chapter in its volume, and in none when the staged payload predates chapter volumes', async () => {
    const rows: Row[] = [];
    const db = { insert: () => ({ values: async (values: Row[]) => void rows.push(...values) }) };

    await landFinalChapters(db as never, 11n, [
      { title: 'The Letter', content: 'Oren took the letter.', volumeKey: 'volume_1' },
      { title: 'Landfall', content: 'The boat grounded.' },
    ]);

    expect(rows.map(row => [row['number'], row['volumeKey']])).toEqual([
      [1, 'volume_1'],
      [2, null],
    ]);
  });
});
