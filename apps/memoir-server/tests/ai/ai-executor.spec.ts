import { describe, expect, it } from 'bun:test';

import { AppErrorCode } from '@server/classes';
import { type InferenceClient, type InferenceRequest, type InferenceResult } from '@modules/inference';
import { AiExecutorService } from '@modules/ai-worker/ai-executor.service';

const TASK = { id: 'task-1', accountId: 7n, queryText: 'How was my week?', kind: 'adhoc', quotaConsumed: true } as never;
const GOOD = { answer: 'fine', patterns: [], suggestions: [], limitationNote: null };

function build(options: { tier?: 'free' | 'paid'; inference: (request: InferenceRequest) => Promise<InferenceResult>; attempts?: number }) {
  const calls: string[] = [];
  const sweeps: string[] = [];
  const inferenceRequests: InferenceRequest[] = [];
  const repository = {
    recordAudit: async () => {},
    findAccount: async () => ({ id: 7n, identitySub: 'sub-7', timezone: 'UTC', intensityMode: 'standard', deletionState: 'none' }),
    consentSnapshot: async () => ({ journal: false, health: false }),
    attempts: async () => options.attempts ?? 1,
    requeue: async () => void calls.push('requeue'),
    fail: async (_task: unknown, reason: string) => void calls.push(`fail:${reason}`),
    quotaRank: async () => 1,
    completeWithResult: async (draft: { modelId: string }) => (calls.push(`complete:${draft.modelId}`), { id: 1n, suggestions: [] }),
  };
  const readAssembly = {
    windowStartFor: () => null,
    assemble: async () => ({ context: {}, dataClasses: [], rowCounts: {}, sensitiveSources: [], questIds: [] }),
  };
  const inference = {
    completeJson: (request: InferenceRequest) => {
      inferenceRequests.push(request);
      return options.inference(request);
    },
  } as InferenceClient;
  const executor = new AiExecutorService(
    { registerSweep: (name: string) => void sweeps.push(name) } as never,
    repository as never,
    {} as never,
    readAssembly as never,
    { getTier: async () => options.tier ?? 'paid' } as never,
    inference,
    { enqueue: async () => {} } as never,
  );
  return { executor, calls, sweeps, inferenceRequests };
}

describe('AiExecutorService inference handling', () => {
  it('should register every sweep unconditionally', () => {
    const { executor, sweeps } = build({ inference: async () => ({ content: GOOD, model: 'm' }) });
    executor.onModuleInit();
    expect(sweeps).toHaveLength(4);
  });

  it('should send the identity sub and the entitlement tier as plan to inference', async () => {
    const { executor, inferenceRequests } = build({ tier: 'free', inference: async () => ({ content: GOOD, model: 'm' }) });
    await executor.execute(TASK);

    expect(inferenceRequests[0]).toMatchObject({ task: 'memoir.insight', subjectId: 'sub-7', plan: 'free' });
  });

  it('should record the model that answered on the result', async () => {
    const { executor, calls } = build({ inference: async () => ({ content: GOOD, model: 'claude-haiku' }) });
    expect(await executor.execute(TASK)).toBe('done');
    expect(calls).toEqual(['complete:claude-haiku']);
  });

  it('should fail and refund once on a terminal refusal without requeueing', async () => {
    const { executor, calls } = build({
      inference: async () => {
        throw AppErrorCode.AI_013.create();
      },
    });
    expect(await executor.execute(TASK)).toBe('failed');
    expect(calls).toEqual(['fail:inference_refused']);
  });

  it('should requeue a transient failure without touching the quota while attempts remain', async () => {
    const { executor, calls } = build({
      attempts: 1,
      inference: async () => {
        throw AppErrorCode.AI_009.create();
      },
    });
    expect(await executor.execute(TASK)).toBe('retried');
    expect(calls).toEqual(['requeue']);
  });

  it('should fail and refund a transient failure only at the attempt ceiling', async () => {
    const { executor, calls } = build({
      attempts: 3,
      inference: async () => {
        throw AppErrorCode.AI_009.create();
      },
    });
    expect(await executor.execute(TASK)).toBe('failed');
    expect(calls).toEqual(['fail:inference_unavailable']);
  });
});
