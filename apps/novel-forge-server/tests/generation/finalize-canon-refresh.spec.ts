import { describe, expect, it } from 'bun:test';

import { type WorkflowRunResult } from '@modules/ai/graphs/workflow-run.service';
import { type JobOrigin } from '@modules/jobs/job.service';

import { FakeAuthoringClaims } from '../jobs/authoring-claim-fixtures';
import { makeGenerationService } from './generation-fixtures';

const ORIGIN: JobOrigin = { sessionId: 'session-1', messageId: '12', proposalId: '40', opIndex: 0 };

interface FinalizeFixture {
  status?: string;
  outcome?: 'inserted' | 'reset' | 'deduped';
  enqueueError?: Error;
}

function finalizing(fixture: FinalizeFixture = {}) {
  const claims = new FakeAuthoringClaims();
  const enqueued: unknown[][] = [];
  const dispatched: string[] = [];
  const heldAtEnqueue: number[] = [];
  const jobService = {
    enqueueJob: async (...args: unknown[]) => {
      heldAtEnqueue.push(claims.rows.size);
      if (fixture.enqueueError) throw fixture.enqueueError;
      enqueued.push(args);
      return { id: 'job-9', outcome: fixture.outcome ?? 'inserted' };
    },
  };
  const jobExecutor = { dispatch: async (jobId: string) => void dispatched.push(jobId) };
  const service = makeGenerationService({}, { claims, jobService, jobExecutor });
  const run: WorkflowRunResult = { runId: 'run-1', outcome: fixture.status ?? 'completed', status: fixture.status ?? 'completed' };
  Object.assign(service, { finalizeClaimed: async () => ({ chapter: 5, run }) });
  return { service, run, enqueued, dispatched, heldAtEnqueue };
}

describe('GenerationService.finalize — Story Bible refresh', () => {
  it('should queue the chapter’s Story Bible refresh once the chapter finalized and the claim is released', async () => {
    const { service, run, enqueued, dispatched, heldAtEnqueue } = finalizing();

    await expect(service.finalize(1n, { chapter: 5 })).resolves.toEqual(run);

    expect(enqueued).toEqual([[1n, 'canon_refresh', 'chapter-5', { chapter: 5 }]]);
    expect(dispatched).toEqual(['job-9']);
    expect(heldAtEnqueue).toEqual([0]);
  });

  it('should carry the chat card a finalize was accepted from, so the chat shows the refresh', async () => {
    const { service, enqueued } = finalizing();

    await service.finalize(1n, { chapter: 5 }, ORIGIN);

    expect(enqueued[0]?.[3]).toEqual({ chapter: 5, origin: ORIGIN });
  });

  it('should queue nothing when the chapter did not finalize', async () => {
    const { service, enqueued } = finalizing({ status: 'failed' });

    await service.finalize(1n, { chapter: 5 });

    expect(enqueued).toEqual([]);
  });

  it('should still answer the finalize when the refresh cannot be queued', async () => {
    const { service, run, dispatched } = finalizing({ enqueueError: new Error('database unavailable') });

    await expect(service.finalize(1n, { chapter: 5 })).resolves.toEqual(run);
    expect(dispatched).toEqual([]);
  });

  it('should not dispatch a second time a refresh already queued or running', async () => {
    const { service, dispatched } = finalizing({ outcome: 'deduped' });

    await service.finalize(1n, { chapter: 5 });

    expect(dispatched).toEqual([]);
  });
});
