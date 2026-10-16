import { describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

import { dispatchFailure, providersExhausted } from '@modules/inference/dispatch-failure.util';
import { ProviderCallError } from '@modules/providers/provider-call.error';

const failure = (code: string, retryable = false): ProviderCallError => new ProviderCallError({ retryable, code, message: `upstream said ${code}` });

describe('dispatchFailure', () => {
  it("should answer a malformed session as the caller's invalid request, naming the member", () => {
    const { error, status } = dispatchFailure(failure('invalid_session'), undefined);
    expect([error.code, status, error.data?.['param']]).toEqual(['SYN_INVALID_REQUEST', 'error', 'synapse.session']);
  });

  it('should answer a request Synapse built badly or could not authenticate as an upstream error', () => {
    for (const code of ['invalid_request', 'invalid_api_key', 'missing_api_key', 'unsupported', 'invalid_response', 'stream_truncated', 'upstream_read']) {
      expect([code, dispatchFailure(failure(code), undefined).error.code]).toEqual([code, 'SYN_UPSTREAM_ERROR']);
    }
  });

  it('should answer an upstream refusal and a retryable failure that came too late to fail over as an upstream error', () => {
    const late = new ProviderCallError({ retryable: false, bytesSent: true, status: 503, message: 'overloaded' });
    expect(dispatchFailure(late, undefined)).toMatchObject({ status: 'error', error: { code: 'SYN_UPSTREAM_ERROR', status: 502 } });
    expect(dispatchFailure(new ProviderCallError({ retryable: false, status: 401, code: 'unauthorized', message: 'no' }), undefined).error.code).toBe('SYN_UPSTREAM_ERROR');
  });

  it('should answer a provider timeout as SYN_TIMEOUT and record it cancelled', () => {
    expect(dispatchFailure(failure('timeout'), undefined)).toMatchObject({ status: 'cancelled', error: { code: 'SYN_TIMEOUT', status: 504 } });
  });

  it("should record an aborted call cancelled, answering by the abort's cause", () => {
    expect(dispatchFailure(failure('aborted'), 'client')).toMatchObject({ status: 'cancelled', error: { code: 'SYN_PROVIDERS_EXHAUSTED' } });
    expect(dispatchFailure(failure('aborted'), 'stalled').status).toBe('cancelled');
    expect(dispatchFailure(failure('aborted'), 'timeout').error.code).toBe('SYN_TIMEOUT');
    expect(dispatchFailure(failure('aborted'), 'shutdown').error.message).toBe('Every provider deployment failed: Synapse is shutting down; retry the call');
    expect(dispatchFailure(failure('aborted'), undefined).status).toBe('cancelled');
  });

  it('should treat whatever failed after the abort as the abort', () => {
    expect(dispatchFailure(failure('upstream_read'), 'client').status).toBe('cancelled');
    expect(dispatchFailure(new Error('reader cancelled'), 'timeout')).toMatchObject({ status: 'cancelled', error: { code: 'SYN_TIMEOUT' } });
  });

  it('should record a budget refusal as refused and pass other domain errors through', () => {
    const budget = AppErrorCode.SYN_BUDGET_COST.create();
    expect(dispatchFailure(budget, undefined)).toEqual({ status: 'refused', error: budget });
    const exhausted = providersExhausted(failure('connect', true));
    expect(dispatchFailure(exhausted, undefined)).toEqual({ status: 'error', error: exhausted });
  });

  it('should hide an unexpected failure behind an internal error', () => {
    const { error, status } = dispatchFailure(new TypeError('boom'), undefined);
    expect([AppError.is(error), error.isInternal, status]).toEqual([true, true, 'error']);
  });
});

describe('providersExhausted', () => {
  it('should always carry the last upstream reason in its message', () => {
    expect(providersExhausted(failure('connect', true)).message).toBe('Every provider deployment failed: upstream said connect');
    expect(providersExhausted(undefined).message).toBe('Every provider deployment failed: No deployment could be tried');
  });
});
