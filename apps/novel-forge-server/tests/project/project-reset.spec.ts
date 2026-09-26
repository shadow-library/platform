import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { ProjectService } from '@modules/project/project/project.service';
import { briefContentHash } from '@server/common';
import { schema } from '@server/database';

import { matchesWhere } from '../sql-filter';

type Row = Record<string, unknown>;

function fakeProject(briefs: Row[], volumes: Row[]) {
  const tables = new Map<unknown, Row[]>([
    [schema.briefs, briefs],
    [schema.volumes, volumes],
  ]);
  const rows = (table: unknown): Row[] => tables.get(table) ?? [];
  const transactions: unknown[] = [];
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: async (condition: SQL) => rows(table).filter(row => matchesWhere(row, condition)) }) }),
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: async (condition: SQL) =>
          rows(table)
            .filter(row => matchesWhere(row, condition))
            .forEach(row => Object.assign(row, values)),
      }),
    }),
    delete: (table: unknown) => ({
      where: async (condition: SQL) =>
        void tables.set(
          table,
          rows(table).filter(row => !matchesWhere(row, condition)),
        ),
    }),
  };
  const db = { transaction: async (run: (handle: unknown) => Promise<unknown>) => (transactions.push(run), run(tx)) };
  const noop = {} as never;
  return { service: new ProjectService({ getPostgresClient: () => db } as never, noop, noop, noop, noop), rows, transactions };
}

describe('ProjectService.reset', () => {
  it('should take every brief out of the volumes a plan reset deletes, in the one transaction that deletes them', async () => {
    const assigned = { id: 1n, projectId: 7n, chapter: 1, body: 'Ada meets the clerk.', volumeKey: 'volume_1', revision: 2, contentHash: 'old' };
    const unassigned = { id: 2n, projectId: 7n, chapter: 2, body: 'The clerk lies.', volumeKey: null, revision: 1, contentHash: 'kept' };
    const { service, rows, transactions } = fakeProject([assigned, unassigned], [{ id: 1n, projectId: 7n, volumeKey: 'volume_1' }]);

    const result = await service.reset(7n, 'plan');

    expect(transactions).toHaveLength(1);
    expect(result.tablesCleared).toEqual(['volumes', 'briefs.volumeKey']);
    expect(rows(schema.volumes)).toEqual([]);
    expect(rows(schema.briefs)[0]).toMatchObject({ volumeKey: null, revision: 3, contentHash: briefContentHash({ ...assigned, volumeKey: null }) });
    expect(rows(schema.briefs)[1]).toMatchObject({ revision: 1, contentHash: 'kept' });
  });
});

describe('ProjectService.reset — authoring claims', () => {
  function fakeClaimProject(claim: Row | undefined, job: Row | undefined) {
    const deleted: unknown[] = [];
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: async () => (claim ? [claim] : []) }) }) }),
      query: { jobs: { findFirst: async () => job } },
      delete: (table: unknown) => ({ where: async () => void deleted.push(table) }),
    };
    const db = {
      transaction: async (run: (handle: unknown) => Promise<unknown>) => run(tx),
      delete: (table: unknown) => ({ where: async () => void deleted.push(table) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    };
    const noop = {} as never;
    return { service: new ProjectService({ getPostgresClient: () => db } as never, noop, noop, noop, noop), deleted };
  }

  it('should refuse a generate reset while the claim is held by a pending or running job, deleting nothing', async () => {
    for (const status of ['pending', 'in_progress']) {
      const { service, deleted } = fakeClaimProject({ projectId: 7n, jobId: 'job-1', kind: 'generate' }, { status });

      await expect(service.reset(7n, 'generate')).rejects.toMatchObject({ code: 'PRJ_011' });
      expect(deleted).toEqual([]);
    }
  });

  it('should release a claim whose job has ended before deleting the jobs it names', async () => {
    const { service, deleted } = fakeClaimProject({ projectId: 7n, jobId: 'job-1', kind: 'generate' }, { status: 'failed' });

    await service.reset(7n, 'generate');

    expect(deleted[0]).toBe(schema.authoringClaims);
    expect(deleted).toContain(schema.jobs);
  });

  it('should reset without touching claims when none is held', async () => {
    const { service, deleted } = fakeClaimProject(undefined, undefined);

    await service.reset(7n, 'generate');

    expect(deleted).not.toContain(schema.authoringClaims);
    expect(deleted).toContain(schema.jobs);
  });
});
