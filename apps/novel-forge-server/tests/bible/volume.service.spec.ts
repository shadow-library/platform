import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { VolumeService } from '@modules/bible/volume/volume.service';
import { schema } from '@server/database';

import { matchesWhere, queryRows } from '../sql-filter';

type Row = Record<string, unknown>;

/** An in-memory `volumes`/`chapters` pair honouring the filters the service writes, transactions included. */
function fakeDb(seed: { volumes?: Row[]; chapters?: Row[] } = {}) {
  const tables = new Map<unknown, Row[]>([
    [
      schema.volumes,
      (seed.volumes ?? []).map((row, index) => ({
        id: BigInt(index + 1),
        projectId: 1n,
        revision: 1,
        contentHash: null,
        ordinal: 0,
        title: null,
        objective: null,
        body: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...row,
      })),
    ],
    [schema.chapters, (seed.chapters ?? []).map((row, index) => ({ id: BigInt(index + 1), projectId: 1n, ...row }))],
  ]);
  const rows = (table: unknown): Row[] => tables.get(table) ?? [];
  const finder = (table: unknown) => ({
    findFirst: async (query: Parameters<typeof queryRows>[1]) => queryRows(rows(table), query)[0],
    findMany: async (query: Parameters<typeof queryRows>[1] = {}) => queryRows(rows(table), query),
  });
  const db = {
    query: { volumes: finder(schema.volumes), chapters: finder(schema.chapters) },
    $count: async (table: unknown, where?: SQL) => queryRows(rows(table), { where }).length,
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: (condition: SQL) => {
          const changed = rows(table).filter(row => matchesWhere(row, condition));
          for (const row of changed) Object.assign(row, values);
          return Object.assign(Promise.resolve(), { returning: async () => changed });
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return db;
}

function service(seed: Parameters<typeof fakeDb>[0] = {}): VolumeService {
  return new VolumeService({ getPostgresClient: () => fakeDb(seed) } as never);
}

describe('VolumeService.advanceGoalMet', () => {
  it('should complete the active volume and activate the next not-started one', async () => {
    const result = await service({
      volumes: [
        { volumeKey: 'v1', ordinal: 1, state: 'active' },
        { volumeKey: 'v2', ordinal: 2, state: 'not_started' },
      ],
    }).advanceGoalMet(1n, 'v1');

    expect(result.completed.volumeKey).toBe('v1');
    expect(result.completed.state).toBe('goal_met');
    expect(result.completed.revision).toBe(2);
    expect(result.activated?.volumeKey).toBe('v2');
    expect(result.activated?.state).toBe('active');
  });

  it('should leave no volume active when there is nothing later to start', async () => {
    const result = await service({ volumes: [{ volumeKey: 'v1', ordinal: 1, state: 'active' }] }).advanceGoalMet(1n, 'v1');

    expect(result.completed.state).toBe('goal_met');
    expect(result.activated).toBeNull();
  });

  it('should allow an empty completed volume with zero chapters', async () => {
    const result = await service({ volumes: [{ volumeKey: 'v1', ordinal: 1, state: 'active' }], chapters: [] }).advanceGoalMet(1n, 'v1');

    expect(result.completed.chapterCount).toBe(0);
    expect(result.completed.firstChapter).toBeNull();
    expect(result.completed.wordCount).toBe(0);
  });

  it('should refuse to mark a volume that is not currently active', async () => {
    await expect(service({ volumes: [{ volumeKey: 'v1', ordinal: 1, state: 'not_started' }] }).advanceGoalMet(1n, 'v1')).rejects.toThrow();
  });

  it('should refuse an already goal-met volume, never applying the transition twice', async () => {
    await expect(service({ volumes: [{ volumeKey: 'v1', ordinal: 1, state: 'goal_met' }] }).advanceGoalMet(1n, 'v1')).rejects.toThrow();
  });

  it('should not activate a later volume that is already active or goal met', async () => {
    const result = await service({
      volumes: [
        { volumeKey: 'v1', ordinal: 1, state: 'active' },
        { volumeKey: 'v2', ordinal: 2, state: 'goal_met' },
        { volumeKey: 'v3', ordinal: 3, state: 'not_started' },
      ],
    }).advanceGoalMet(1n, 'v1');

    expect(result.activated?.volumeKey).toBe('v3');
  });

  it('should reject an unknown volume key', async () => {
    await expect(service({ volumes: [] }).advanceGoalMet(1n, 'missing')).rejects.toThrow();
  });
});

describe('VolumeService derived display data', () => {
  it('should compute chapter count, range and word count on read for list()', async () => {
    const result = await service({
      volumes: [{ volumeKey: 'v1', ordinal: 1, state: 'active' }],
      chapters: [
        { number: 1, wordCount: 1000, volumeKey: 'v1' },
        { number: 2, wordCount: 1500, volumeKey: 'v1' },
      ],
    }).list(1n, { limit: 20, offset: 0, sortBy: 'createdAt', sortOrder: 'asc' });

    expect(result.items[0]).toMatchObject({ chapterCount: 2, firstChapter: 1, lastChapter: 2, wordCount: 2500 });
  });

  it('should report an empty volume with zero counts and null range for get()', async () => {
    const volume = await service({ volumes: [{ volumeKey: 'v1', ordinal: 1, state: 'not_started' }], chapters: [] }).get(1n, 'v1');
    expect(volume).toMatchObject({ chapterCount: 0, firstChapter: null, lastChapter: null, wordCount: 0 });
  });
});
