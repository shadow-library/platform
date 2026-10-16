import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { AuthGuardErrorCode } from '@shadow-library/auth/module';
import { AppError, ValidationError } from '@shadow-library/common';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';
import { type HttpRequest, type HttpResponse, ServerErrorCode } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

import { SynapseErrorHandler } from '@modules/inference/synapse-error.handler';
import { errorBodyOf, errorTypeFor, rendersSynapseErrors } from '@modules/inference/synapse-error.util';

interface SentReply {
  status?: number;
  contentType?: string;
  serialized?: string;
  payload?: unknown;
}

function replyRecorder(sent: SentReply): HttpResponse {
  let serializer: ((payload: unknown) => string) | undefined;
  const reply = {
    status: (status: number) => ((sent.status = status), reply),
    type: (contentType: string) => ((sent.contentType = contentType), reply),
    serializer: (fn: (payload: unknown) => string) => ((serializer = fn), reply),
    send: (payload: unknown) => {
      sent.payload = payload;
      sent.serialized = serializer?.(payload);
      return reply;
    },
  };
  return reply as unknown as HttpResponse;
}

function handle(error: Error, url = '/api/v1/chat/completions'): SentReply {
  const sent: SentReply = {};
  new SynapseErrorHandler().handle(error, { url } as HttpRequest, replyRecorder(sent));
  return sent;
}

let restoreLogger: RestoreLogger;
beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

describe('rendersSynapseErrors', () => {
  it('should cover the inference and catalog routes and leave the admin and auth routes to the platform', () => {
    for (const url of ['/api/v1/chat/completions', '/api/v1/embeddings?x=1', '/api/v1/images/generations', '/api/v1/catalog?task=a.b', '/api/v1/unknown'])
      expect([url, rendersSynapseErrors(url)]).toEqual([url, true]);
    for (const url of ['/api/v1/admin/catalog/draft', '/api/v1/admin', '/api/auth/login', '/health']) expect([url, rendersSynapseErrors(url)]).toEqual([url, false]);
  });
});

describe('errorTypeFor', () => {
  it('should classify by status', () => {
    expect([400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503, 504].map(errorTypeFor)).toEqual([
      'invalid_request_error',
      'authentication_error',
      'authentication_error',
      'invalid_request_error',
      'invalid_request_error',
      'invalid_request_error',
      'invalid_request_error',
      'rate_limit_error',
      'server_error',
      'server_error',
      'server_error',
      'server_error',
    ]);
  });
});

describe('SynapseErrorHandler', () => {
  it('should render a SYN error in the OpenAI shape with its own status, through a plain JSON serializer', () => {
    const sent = handle(AppErrorCode.SYN_BUDGET_COST.create({ window: '1h' }));

    expect(sent.status).toBe(429);
    expect(sent.contentType).toBe('application/json; charset=utf-8');
    expect(JSON.parse(sent.serialized ?? '')).toEqual({
      error: { message: 'The cost budget for the current window is exhausted', type: 'rate_limit_error', code: 'SYN_BUDGET_COST' },
    });
  });

  it('should carry the member at fault as param', () => {
    expect(handle(AppErrorCode.SYN_INVALID_REQUEST.create({ param: 'synapse.session' })).payload).toEqual({
      error: { message: 'Invalid request', type: 'invalid_request_error', code: 'SYN_INVALID_REQUEST', param: 'synapse.session' },
    });
  });

  it("should keep the auth guard's codes, typed by status", () => {
    expect(handle(AuthGuardErrorCode.IAM_001.create()).payload).toEqual({ error: { message: 'Authentication required', type: 'authentication_error', code: 'IAM_001' } });
    expect(handle(AuthGuardErrorCode.IAM_002.create(), '/api/v1/catalog').payload).toMatchObject({ error: { type: 'authentication_error', code: 'IAM_002' } });
  });

  it("should keep a validation failure's code and name the first field without its request part", () => {
    const validation = new ValidationError('body.synapse.request_id', 'must NOT have more than 64 characters').addFieldError('body.messages', 'must NOT have fewer than 1 items');
    const sent = handle(validation);

    expect(sent.status).toBe(422);
    expect(sent.payload).toEqual({
      error: {
        message: 'synapse.request_id: must NOT have more than 64 characters; messages: must NOT have fewer than 1 items',
        type: 'invalid_request_error',
        code: 'VALIDATION_ERROR',
        param: 'synapse.request_id',
      },
    });
  });

  it('should mask an internal error behind the generic face', () => {
    const sent = handle(AppError.internal('database password is hunter2', { param: 'secret' }));
    expect(sent.status).toBe(500);
    expect(sent.payload).toEqual({ error: { message: 'Unknown Error', type: 'server_error', code: 'UNKNOWN' } });
  });

  it('should render a Fastify failure such as an oversized body', () => {
    const tooLarge = Object.assign(new Error('Request body is too large'), { name: 'FastifyError', code: 'FST_ERR_CTP_BODY_TOO_LARGE', statusCode: 413 });
    expect(handle(tooLarge)).toMatchObject({ status: 413, payload: { error: { message: 'Request body is too large', type: 'invalid_request_error', code: 'S006' } } });
  });

  it('should leave the admin routes in the platform shape', () => {
    const sent = handle(ServerErrorCode.S002.create(), '/api/v1/admin/catalog/draft');
    expect(sent.status).toBe(404);
    expect(sent.payload).toEqual({ code: 'S002', message: 'The requested endpoint does not exist' });
    expect(sent.serialized).toBeUndefined();
  });
});

describe('errorBodyOf', () => {
  it('should render the error frame a failed stream ends with', () => {
    expect(errorBodyOf(AppErrorCode.SYN_TIMEOUT.create())).toEqual({ error: { message: 'The request timed out', type: 'server_error', code: 'SYN_TIMEOUT' } });
  });
});
