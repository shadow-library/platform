import { describe, expect, it } from 'bun:test';

import { PromiseService } from '@modules/bible/promise/promise.service';
import { type ListPromisesQuery } from '@modules/bible/promise/promise.dto';
import { schema } from '@server/database';

import { queryRows } from '../sql-filter';

type Row = Record<string, unknown>;

function fakeDb(seed: { threads?: Row[]; mysteries?: Row[]; milestones?: Row[]; volumes?: Row[]; drafts?: Row[]; chapters?: Row[] } = {}) {
  const tables = new Map<unknown, Row[]>([
    [
      schema.plotThreads,
      (seed.threads ?? []).map(row => ({
        projectId: 1n,
        intentionallyOpen: false,
        openedChapter: null,
        closedChapter: null,
        lastAdvancedChapter: null,
        payoffWindow: null,
        payoffMilestoneKey: null,
        payoffVolumeKey: null,
        createdAt: new Date(2024, 0, 1),
        updatedAt: new Date(2024, 0, 1),
        ...row,
      })),
    ],
    [
      schema.mysteries,
      (seed.mysteries ?? []).map(row => ({
        projectId: 1n,
        intentionallyOpen: false,
        openedChapter: null,
        resolvedChapter: null,
        lastAdvancedChapter: null,
        payoffWindow: null,
        payoffMilestoneKey: null,
        payoffVolumeKey: null,
        createdAt: new Date(2024, 0, 1),
        updatedAt: new Date(2024, 0, 1),
        ...row,
      })),
    ],
    [schema.milestones, (seed.milestones ?? []).map(row => ({ projectId: 1n, ...row }))],
    [schema.volumes, (seed.volumes ?? []).map(row => ({ projectId: 1n, ...row }))],
    [schema.drafts, (seed.drafts ?? []).map(row => ({ projectId: 1n, ...row }))],
    [schema.chapters, (seed.chapters ?? []).map(row => ({ projectId: 1n, ...row }))],
  ]);
  const rows = (table: unknown): Row[] => tables.get(table) ?? [];
  const finder = (table: unknown) => ({ findMany: async (query: Parameters<typeof queryRows>[1] = {}) => queryRows(rows(table), query) });
  return {
    query: {
      plotThreads: finder(schema.plotThreads),
      mysteries: finder(schema.mysteries),
      milestones: finder(schema.milestones),
      volumes: finder(schema.volumes),
      drafts: finder(schema.drafts),
      chapters: finder(schema.chapters),
    },
  };
}

function service(seed: Parameters<typeof fakeDb>[0] = {}): PromiseService {
  return new PromiseService({ getPostgresClient: () => fakeDb(seed) } as never);
}

function query(overrides: Partial<ListPromisesQuery> = {}): ListPromisesQuery {
  return { limit: 25, offset: 0, sortBy: 'createdAt', sortOrder: 'asc', ...overrides } as ListPromisesQuery;
}

describe('PromiseService.list', () => {
  it('should list open threads and mysteries together', async () => {
    const result = await service({
      threads: [{ threadKey: 'lamp', status: 'open', summary: 'The lamp' }],
      mysteries: [{ mysteryKey: 'killer', status: 'open', question: 'Who?' }],
    }).list(1n, query());

    expect(result.total).toBe(2);
    expect(result.items.map(item => item.kind).sort()).toEqual(['mystery', 'thread']);
  });

  it('should never surface a mystery truth fact', async () => {
    const result = await service({ mysteries: [{ mysteryKey: 'killer', status: 'open', question: 'Who?', truthFactKey: 'fact:1' }] }).list(1n, query());
    expect(result.items[0]).not.toHaveProperty('truthFactKey');
  });

  it('should filter by kind', async () => {
    const result = await service({
      threads: [{ threadKey: 'lamp', status: 'open', summary: 'The lamp' }],
      mysteries: [{ mysteryKey: 'killer', status: 'open', question: 'Who?' }],
    }).list(1n, query({ kind: 'mystery' }));

    expect(result.items.map(item => item.kind)).toEqual(['mystery']);
  });

  it('should filter by status', async () => {
    const result = await service({
      threads: [
        { threadKey: 'lamp', status: 'open', summary: 'The lamp' },
        { threadKey: 'door', status: 'closed', summary: 'The door' },
      ],
    }).list(1n, query({ status: 'closed' }));

    expect(result.items.map(item => item.key)).toEqual(['door']);
  });

  it('should mark a thread overdue once its authored chapter window has passed', async () => {
    const result = await service({
      threads: [{ threadKey: 'lamp', status: 'open', summary: 'The lamp', payoffWindow: 3 }],
      chapters: [
        { number: 1, status: 'done' },
        { number: 2, status: 'done' },
        { number: 3, status: 'done' },
      ],
    }).list(1n, query());

    expect(result.items[0]?.due).toBe('overdue');
  });

  it('should mark a mystery due while its payoff volume is active', async () => {
    const result = await service({
      mysteries: [{ mysteryKey: 'killer', status: 'open', question: 'Who?', payoffVolumeKey: 'v1' }],
      volumes: [{ volumeKey: 'v1', state: 'active' }],
    }).list(1n, query());

    expect(result.items[0]?.due).toBe('due');
  });

  it('should paginate with limit and offset', async () => {
    const threads = Array.from({ length: 5 }, (_, i) => ({ threadKey: `t${i}`, status: 'open' as const, summary: `Thread ${i}`, createdAt: new Date(2024, 0, i + 1) }));
    const result = await service({ threads }).list(1n, query({ limit: 2, offset: 2 }));

    expect(result.total).toBe(5);
    expect(result.items.map(item => item.key)).toEqual(['t2', 't3']);
  });
});
