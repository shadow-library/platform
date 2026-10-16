import { describe, expect, it } from 'bun:test';

import { classifyHttpFailure, classifyPayloadError, trimUpstreamMessage } from '@modules/providers/provider-call.error';

function body(error: object): string {
  return JSON.stringify({ error });
}

describe('classifyHttpFailure', () => {
  it('should retry on request timeout, rate limit and every server error', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) expect({ status, retryable: classifyHttpFailure(status, '').retryable }).toEqual({ status, retryable: true });
  });

  it('should retry a 400 only for an unsupported parameter', () => {
    expect(classifyHttpFailure(400, body({ message: 'temperature is not supported', code: 'unsupported_parameter' }))).toMatchObject({
      retryable: true,
      status: 400,
      code: 'unsupported_parameter',
    });
    expect(classifyHttpFailure(400, body({ message: 'messages is required', code: 'invalid_request' })).retryable).toBe(false);
  });

  it('should treat other client errors as fatal', () => {
    for (const status of [400, 401, 403, 404, 413, 422]) expect(classifyHttpFailure(status, '').retryable).toBe(false);
  });

  it("should carry the upstream's own error message, trimmed", () => {
    expect(classifyHttpFailure(401, body({ message: '  No auth\n  credentials found ', code: 401 })).message).toBe('No auth credentials found');
  });

  it('should never carry a body that is not an error envelope, only the status', () => {
    for (const text of ['<html>Bad gateway for sk-or-secret</html>', '   ', '{"detail":"echoed prompt"}']) {
      expect(classifyHttpFailure(502, text).message).toBe('The upstream answered HTTP 502');
    }
  });

  it('should ignore a numeric error code as the code', () => {
    expect(classifyHttpFailure(429, body({ message: 'slow down', code: 429 })).code).toBeUndefined();
  });

  it('should never mark an error as sent', () => {
    expect(classifyHttpFailure(500, '').bytesSent).toBe(false);
  });
});

describe('classifyPayloadError', () => {
  it("should read a status from OpenRouter's numeric error code", () => {
    expect(classifyPayloadError({ message: 'Provider returned error', code: 502 }, false)).toMatchObject({ retryable: true, status: 502 });
  });

  it("should retry the gateway's transient error types before any chunk was sent", () => {
    expect(classifyPayloadError({ message: 'busy', type: 'rate_limit_error', code: null }, false).retryable).toBe(true);
    expect(classifyPayloadError({ message: 'bad', type: 'invalid_request_error', code: null }, false).retryable).toBe(false);
  });

  it('should never retry once a chunk was sent', () => {
    expect(classifyPayloadError({ message: 'Provider returned error', code: 503 }, true)).toMatchObject({ retryable: false, bytesSent: true });
  });
});

describe('trimUpstreamMessage', () => {
  it('should collapse whitespace and cap the length', () => {
    const trimmed = trimUpstreamMessage(`a  b\n${'x'.repeat(500)}`);

    expect(trimmed.startsWith('a b x')).toBe(true);
    expect(trimmed).toHaveLength(300);
  });
});
