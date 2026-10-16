import { describe, expect, it } from 'bun:test';

import { AppError, ErrorCode } from '@shadow-library/common';
import { SynapseError } from '@shadow-library/synapse';

import { AppErrorCode } from '@server/classes';

import { fromSynapseFailure, synapseCallFailed } from '@modules/ai/synapse-failure';
import { runToolLoop } from '@modules/ai/tools/tool-loop';

const refusal = (code: string, status: number): SynapseError => new SynapseError(status, code, `refused with ${code}`);

describe('fromSynapseFailure', () => {
  const table: [string, number, string, Record<string, unknown> | undefined][] = [
    ['SYN_ALIAS_UNAVAILABLE', 422, 'AI_003', undefined],
    ['SYN_NO_ELIGIBLE_MODEL', 422, 'AI_003', undefined],
    ['SYN_POLICY_DENIED', 403, 'AI_003', undefined],
    ['SYN_BUDGET_CALLS', 429, 'AI_008', undefined],
    ['SYN_BUDGET_COST', 429, 'AI_009', undefined],
    ['SYN_UNKNOWN_TASK', 404, 'AI_002', undefined],
    ['SYN_TASK_FORBIDDEN', 403, 'AI_002', undefined],
    ['SYN_NO_ACTIVE_CATALOG', 503, 'AI_007', { transient: true }],
    ['SYN_PROVIDERS_EXHAUSTED', 503, 'AI_007', { transient: true }],
    ['SYN_UPSTREAM_ERROR', 502, 'AI_007', { transient: true }],
    ['SYN_TIMEOUT', 504, 'AI_007', { transient: true }],
    ['SYN_INVALID_REQUEST', 400, 'AI_007', { transient: false }],
    ['SYN_DUPLICATE_REQUEST', 409, 'AI_007', { transient: false }],
    ['AUTH_003', 401, 'AI_007', { transient: false }],
  ];

  for (const [code, status, expected, data] of table) {
    it(`should map ${code} to ${expected}`, () => {
      const source = refusal(code, status);
      const mapped = fromSynapseFailure(source) as AppError;

      expect(mapped.code).toBe(expected);
      if (data) expect(mapped.data).toEqual(data);
      expect(mapped.cause).toBe(source);
    });
  }

  it('should treat an unreachable Synapse as a transient model failure', () => {
    const unreachable = ErrorCode.API_REQUEST_NETWORK_ERROR.create({ reason: 'connection refused' });

    expect(fromSynapseFailure(unreachable)).toMatchObject({ code: 'AI_007', data: { transient: true } });
  });

  it('should return any other error unchanged, the hard line refusal included', () => {
    const hardLine = AppErrorCode.AI_015.create({ source: 'The request', rule: 'standalone-term', sourceRefs: [] });
    const plain = new Error('boom');

    expect(fromSynapseFailure(hardLine)).toBe(hardLine);
    expect(fromSynapseFailure(plain)).toBe(plain);
  });

  it('should still give up with AI_007 on a failure that did not come from Synapse', () => {
    expect(synapseCallFailed(new Error('boom'))).toMatchObject({ code: 'AI_007', data: { transient: false } });
    expect(synapseCallFailed(refusal('SYN_BUDGET_CALLS', 429))).toMatchObject({ code: 'AI_008' });
  });
});

describe('runToolLoop', () => {
  const ctx = { node: 'judge', runId: 'run-1' } as never;

  it("should surface a Synapse refusal from a tool round as novel-forge's own error", async () => {
    const model = { bindTools: () => ({ invoke: async () => Promise.reject(refusal('SYN_BUDGET_CALLS', 429)) }) } as never;

    await expect(runToolLoop(model, [], [], [], ctx, {} as never)).rejects.toMatchObject({ code: 'AI_008' });
  });

  it('should map a refusal of the forced final answer once the tool budget is spent', async () => {
    const lookup = { content: '', tool_calls: [{ id: 'call-1', name: 'lookup', args: {} }] };
    const model = {
      bindTools: () => ({ invoke: async () => lookup }),
      invoke: async () => Promise.reject(refusal('SYN_BUDGET_COST', 429)),
    } as never;
    const db = { insert: () => ({ values: () => Promise.resolve() }) } as never;

    await expect(runToolLoop(model, [], [], [], ctx, db, { maxRounds: 1 })).rejects.toMatchObject({ code: 'AI_009' });
  });

  it('should pass any other failure through as it came', async () => {
    const failure = AppError.internal('boom');
    const model = { invoke: async () => Promise.reject(failure) } as never;

    await expect(runToolLoop(model, [], [], [], ctx, {} as never)).rejects.toBe(failure);
  });
});
