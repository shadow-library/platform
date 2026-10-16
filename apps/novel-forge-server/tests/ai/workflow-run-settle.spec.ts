import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';

const dialect = new PgDialect();

/** `cancelOnRecord`: a cancel another replica recorded after this replica's last check, so the completing update matches nothing. */
function runService(cancelOnRecord: boolean) {
  const settled: { status: unknown; where: string }[] = [];
  const db = {
    query: { workflowRuns: { findFirst: async () => undefined } },
    insert: () => ({ values: () => ({ returning: async () => [{ id: 'run-1' }] }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => ({
          returning: async () => {
            const query = dialect.sqlToQuery(where).sql;
            settled.push({ status: values['status'], where: query });
            const blocked = cancelOnRecord && values['status'] === 'completed';
            return blocked ? [] : [{ projectId: 1n, graph: 'chat-turn', target: 'session:s' }];
          },
        }),
      }),
    }),
  };
  const controller = new AbortController();
  const modelRouter = { bindRunSignal: () => controller.signal, releaseRunSignal: () => undefined, abortRun: () => (controller.abort(), true) };
  const cancellation = { watch: () => undefined, unwatch: () => undefined };
  const noop = {} as never;
  const service = new WorkflowRunService(
    { getPostgresClient: () => db } as never,
    noop,
    modelRouter as never,
    noop,
    noop,
    noop,
    noop,
    { publish: () => undefined } as never,
    noop,
    cancellation as never,
  );
  return { service, settled };
}

describe('WorkflowRunService.runChain', () => {
  it('should complete a run only while no cancel is on record', async () => {
    const { service, settled } = runService(false);

    await service.runChain(1n, 'chat-turn', 'session:s', {}, async () => 'reply');

    expect(settled).toEqual([{ status: 'completed', where: expect.stringContaining('"workflow_runs"."cancel_requested_at" is null') }]);
  });

  it('should settle as cancelled, and fail the chain as cancelled, when a cancel recorded elsewhere beat the finish', async () => {
    const { service, settled } = runService(true);

    await expect(service.runChain(1n, 'chat-turn', 'session:s', {}, async () => 'reply')).rejects.toMatchObject({ code: 'AI_013' });
    expect(settled.slice(0, 2).map(write => write.status)).toEqual(['completed', 'cancelled']);
  });
});
