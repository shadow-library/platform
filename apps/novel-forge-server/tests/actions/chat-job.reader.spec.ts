import { describe, expect, it } from 'bun:test';

import { schema } from '@server/database';

import { ChatJobReader } from '@modules/actions/chat-job.reader';

const SESSION = '11111111-1111-4111-8111-111111111111';

/** One chat session with its cursor at 12 and one running job — or, for another project, no session at all; every read is logged with where it ran. */
function readerOver() {
  const reads: { table: string; in: string }[] = [];
  const snapshots: unknown[] = [];
  let scope = 'pool';
  let sessionFound = true;
  const tableName = (table: unknown) => (table === schema.chatSessions ? 'chat_sessions' : table === schema.jobs ? 'jobs' : 'other');
  const select = () => ({
    from: (table: unknown) => ({
      where: () => {
        reads.push({ table: tableName(table), in: scope });
        const rows = table === schema.chatSessions ? (sessionFound ? [{ seq: 12 }] : []) : [{ id: 'job-1' }];
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
  return { reader, reads, snapshots, readAnotherProject: () => void (sessionFound = false) };
}

describe('ChatJobReader', () => {
  it('should read the cursor before the jobs, both from one repeatable-read snapshot, so nothing between them is missed', async () => {
    const { reader, reads, snapshots } = readerOver();

    const listed = await reader.listActive(1n, SESSION);

    expect(listed).toEqual({ items: [{ id: 'job-1' }] as never, cursor: 12 });
    expect(reads).toEqual([
      { table: 'chat_sessions', in: 'snapshot' },
      { table: 'jobs', in: 'snapshot' },
    ]);
    expect(snapshots).toEqual([{ isolationLevel: 'repeatable read', accessMode: 'read only' }]);
  });

  it('should answer another project’s chat as missing', async () => {
    const { reader, readAnotherProject } = readerOver();
    readAnotherProject();

    await expect(reader.sessionCursor(2n, SESSION)).rejects.toMatchObject({ code: 'CHT_001' });
    await expect(reader.listActive(2n, SESSION)).rejects.toMatchObject({ code: 'CHT_001' });
  });
});
