import { describe, expect, it } from 'bun:test';

import { schema } from '@server/database';

import { ChatJobReader } from '@modules/actions/chat-job.reader';

const SESSION = '11111111-1111-4111-8111-111111111111';
const HOUR_MS = 60 * 60_000;

/** Every `Date` reachable inside a drizzle condition tree — enough to check the boundary a query was built with. */
function datesIn(node: unknown, acc: Date[] = [], seen = new Set<unknown>()): Date[] {
  if (node === null || typeof node !== 'object' || seen.has(node)) return acc;
  seen.add(node);
  if (node instanceof Date) {
    acc.push(node);
    return acc;
  }
  for (const value of Object.values(node)) datesIn(value, acc, seen);
  return acc;
}

/**
 * One chat session with its cursor at 12, a queue of job rows the `jobs` table answers with (one entry per
 * successive query — `activeJobs` then `settledJobs`), and, for another project, no session at all. Every
 * read is logged with where it ran, and every `jobs` query's condition is kept for inspection.
 */
function readerOver(jobQueries: { id: string; createdAt: Date }[][] = [[{ id: 'job-1', createdAt: new Date(0) }]]) {
  const reads: { table: string; in: string }[] = [];
  const snapshots: unknown[] = [];
  const jobWheres: unknown[] = [];
  let scope = 'pool';
  let sessionFound = true;
  let jobCall = 0;
  const tableName = (table: unknown) => (table === schema.chatSessions ? 'chat_sessions' : table === schema.jobs ? 'jobs' : 'other');
  const select = () => ({
    from: (table: unknown) => ({
      where: (condition: unknown) => {
        reads.push({ table: tableName(table), in: scope });
        let rows: unknown[];
        if (table === schema.chatSessions) rows = sessionFound ? [{ seq: 12 }] : [];
        else if (table === schema.jobs) {
          jobWheres.push(condition);
          rows = jobQueries[jobCall] ?? [];
          jobCall += 1;
        } else rows = [];
        return { limit: async () => rows, orderBy: async () => rows };
      },
    }),
  });
  const db = {
    select,
    transaction: async (run: (tx: unknown) => Promise<unknown>, config?: unknown) => {
      snapshots.push(config);
      scope = 'snapshot';
      try {
        return await run(db);
      } finally {
        scope = 'pool';
      }
    },
  };
  const reader = new ChatJobReader({ getPostgresClient: () => db } as never);
  return { reader, reads, snapshots, jobWheres, readAnotherProject: () => void (sessionFound = false) };
}

describe('ChatJobReader', () => {
  it('should read the cursor before the jobs, both from one repeatable-read snapshot, so nothing between them is missed', async () => {
    const { reader, reads, snapshots } = readerOver([[{ id: 'job-1', createdAt: new Date(0) }], []]);

    const listed = await reader.listRecent(1n, SESSION);

    expect(listed).toEqual({ items: [{ id: 'job-1', createdAt: new Date(0) }] as never, cursor: 12 });
    expect(reads).toEqual([
      { table: 'chat_sessions', in: 'snapshot' },
      { table: 'jobs', in: 'snapshot' },
      { table: 'jobs', in: 'snapshot' },
    ]);
    expect(snapshots).toEqual([{ isolationLevel: 'repeatable read', accessMode: 'read only' }]);
  });

  it('should answer another project’s chat as missing', async () => {
    const { reader, readAnotherProject } = readerOver();
    readAnotherProject();

    await expect(reader.sessionCursor(2n, SESSION)).rejects.toMatchObject({ code: 'CHT_001' });
    await expect(reader.listRecent(2n, SESSION)).rejects.toMatchObject({ code: 'CHT_001' });
  });

  it('should list a job that settled inside the recently-settled window, merged with the running ones by when each started', async () => {
    const now = Date.now();
    const running = { id: 'job-1', createdAt: new Date(now - 5_000) };
    const settled = { id: 'job-2', createdAt: new Date(now - 1_000), status: 'done' };
    const { reader, jobWheres } = readerOver([[running], [settled]]);

    const listed = await reader.listRecent(1n, SESSION, now);

    expect(listed).toEqual({ items: [running, settled] as never, cursor: 12 });
    expect(datesIn(jobWheres[1])).toContainEqual(new Date(now - HOUR_MS));
  });

  it('should not list a job that settled outside the recently-settled window', async () => {
    const now = Date.now();
    const running = { id: 'job-1', createdAt: new Date(now - 5_000) };
    const { reader, jobWheres } = readerOver([[running], []]);

    const listed = await reader.listRecent(1n, SESSION, now);

    expect(listed.items).toEqual([running] as never);
    expect(datesIn(jobWheres[1])).toContainEqual(new Date(now - HOUR_MS));
  });
});
