import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect, QueryBuilder } from 'drizzle-orm/pg-core';

import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';

const dialect = new PgDialect();

/** `cancelOnRecord`: a cancel another replica recorded after this replica's last check, so the completing update matches nothing. */
function runService(cancelOnRecord: boolean) {
  const settled: { status: unknown; reviewStatus?: unknown; where: string }[] = [];
  const db = {
    query: { workflowRuns: { findFirst: async () => undefined } },
    select: (fields: never) => new QueryBuilder().select(fields),
    insert: () => ({ values: () => ({ returning: async () => [{ id: 'run-1' }] }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => ({
          returning: async () => {
            const query = dialect.sqlToQuery(where).sql;
            settled.push({ status: values['status'], reviewStatus: values['reviewStatus'], where: query });
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

describe('WorkflowRunService settling a run that persisted a draft', () => {
  it('should release a draft the failed run left generating, but only one whose current revision that run wrote', async () => {
    const { service, settled } = runService(false);

    await expect(service.runChain(1n, 'chapter-generation', 'chapter-1', {}, () => Promise.reject(new Error('judge refused')))).rejects.toThrow('judge refused');
    const release = settled.find(write => write.reviewStatus === 'needs_review');

    expect(settled[0]?.status).toBe('failed');
    expect(release?.where).toContain('"draft_revisions"."run_id" = $');
    expect(release?.where).toContain('"draft_revisions"."revision" = "drafts"."revision"');
    expect(release?.where).toContain('"review_status" = $');
  });

  it('should release the draft when the run is cancelled too', async () => {
    const { service, settled } = runService(true);

    await expect(service.runChain(1n, 'chapter-generation', 'chapter-1', {}, async () => 'done')).rejects.toMatchObject({ code: 'AI_013' });

    expect(settled.slice(0, 3).map(write => write.status ?? write.reviewStatus)).toEqual(['completed', 'cancelled', 'needs_review']);
  });
});
