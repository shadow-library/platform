/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { errorCodes } from 'fastify';
import { AppError, Config, Logger, ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { DefaultErrorHandler, sanitizeCause, ServerErrorCode } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('DefaultErrorHandler', () => {
  const request = {} as any;
  const response = { status: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() } as any;
  const body = { code: 'S001', message: expect.any(String) };
  let errorHandler: DefaultErrorHandler;

  beforeEach(() => {
    errorHandler = new DefaultErrorHandler();
    jest.clearAllMocks();
  });

  it('should handle server error', () => {
    const error = ServerErrorCode.S001.create();
    errorHandler.handle(error, request, response);

    expect(response.status).toHaveBeenCalledWith(ServerErrorCode.S001.status);
    expect(response.send).toHaveBeenCalledWith(body);
  });

  it('should handle validation error', () => {
    const error = new ValidationError('name', 'Invalid Name');
    errorHandler.handle(error, request, response);

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.send).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: 'Validation Error',
      fields: [{ field: 'name', msg: 'Invalid Name' }],
    });
  });

  it('should handle app error', () => {
    const error = new AppError(ServerErrorCode.S001);
    errorHandler.handle(error, request, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith(body);
  });

  it('should handle fastify error', () => {
    const error = errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE('application/unknown');
    errorHandler.handle(error, request, response);

    expect(response.status).toHaveBeenCalledWith(415);
    expect(response.send).toHaveBeenCalledWith({
      code: 'S006',
      message: 'Unsupported Media Type: application/unknown',
    });
  });

  it('should handle fastify server error', () => {
    const error = errorCodes.FST_ERR_HOOK_TIMEOUT();
    errorHandler.handle(error, request, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith({ code: 'S001', message: 'An unexpected server error occurred while processing the request' });
  });

  it('should log the cause of the error', () => {
    const error = new AppError(ServerErrorCode.S001, undefined, new Error('Test Cause'));
    const fn = jest.spyOn(errorHandler['logger'], 'warn');
    errorHandler.handle(error, request, response);
    expect(fn).toHaveBeenCalledWith('Caused by', error.cause);
  });

  it('should redact bound SQL parameter values before logging a query-failure cause', () => {
    const queryError = Object.assign(new Error('Failed query: insert into expenses (merchant) values ($1)\nparams: leaked-merchant'), {
      query: 'insert into expenses (merchant) values ($1)',
      params: ['leaked-merchant'],
    });
    const error = new AppError(ServerErrorCode.S001, undefined, queryError);
    const fn = jest.spyOn(errorHandler['logger'], 'warn');
    errorHandler.handle(error, request, response);

    const [, loggedHandling] = fn.mock.calls[0] as [string, Record<string, unknown>];
    const [, loggedCause] = fn.mock.calls[1] as [string, Record<string, unknown>];

    for (const logged of [loggedHandling['cause'], loggedCause]) {
      const cause = logged as Record<string, unknown>;
      expect(cause['params']).toBe('[1 bound param(s) redacted]');
      expect(cause['message']).not.toContain('leaked-merchant');
      expect(cause['stack']).not.toContain('leaked-merchant');
      expect(cause['message']).toContain('insert into expenses (merchant) values ($1)');
    }
  });

  it('should handle unknown error of type Error', () => {
    const error = new Error('Test Error');
    errorHandler.handle(error, request, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith({ code: 'S001', message: 'An unexpected server error occurred while processing the request' });
  });

  it('should handle unknown error of type unknown', () => {
    const error = { error: 'Test Error' } as any;
    errorHandler.handle(error, request, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith({ code: 'S001', message: 'An unexpected server error occurred while processing the request' });
  });

  describe('stack trace', () => {
    beforeEach(() => {
      jest.spyOn(Config, 'get').mockReturnValue(true as any);
    });

    it('should include stack trace in error response when enabled', () => {
      const handler = new DefaultErrorHandler();
      const error = ServerErrorCode.S001.create();
      handler.handle(error, request, response);

      expect(response.send).toHaveBeenCalledWith(expect.objectContaining({ stack: expect.any(String) }));
    });

    it('should warn when stack trace is enabled in production', () => {
      jest.spyOn(Config, 'isProd').mockReturnValue(true);
      const warn = jest.fn();
      jest.spyOn(Logger, 'getLogger').mockReturnValue({ warn, error: jest.fn() } as any);

      new DefaultErrorHandler();

      expect(warn).toHaveBeenCalledWith('Stack trace logging is enabled in production');
    });
  });

  describe('sanitizeCause', () => {
    it('should redact bound params and elide them from message/stack of a query-failure cause', () => {
      const queryError = Object.assign(new Error('Failed query: select * from accounts where email = $1\nparams: secret@example.com'), {
        query: 'select * from accounts where email = $1',
        params: ['secret@example.com'],
      });

      const sanitized = sanitizeCause(queryError) as Record<string, unknown>;

      expect(sanitized['params']).toBe('[1 bound param(s) redacted]');
      expect(sanitized['message']).toBe('Failed query: select * from accounts where email = $1 -- 1 bound param(s) redacted');
      expect(sanitized['stack']).not.toContain('secret@example.com');
    });

    it('should walk nested causes and sanitize a query-failure error wrapped by a non-query error', () => {
      const queryError = Object.assign(new Error('Failed query: delete from accounts where token = $1\nparams: my-secret-token'), {
        query: 'delete from accounts where token = $1',
        params: ['my-secret-token'],
      });
      const wrapper = new Error('constraint violation', { cause: queryError });

      const sanitized = sanitizeCause(wrapper) as Record<string, unknown>;
      const nestedCause = sanitized['cause'] as Record<string, unknown>;

      expect(nestedCause['params']).toBe('[1 bound param(s) redacted]');
      expect(JSON.stringify(sanitized)).not.toContain('my-secret-token');
    });

    it('should leave a cause chain unchanged when no query-failure error is present', () => {
      const cause = new Error('plain failure');
      expect(sanitizeCause(cause)).toBe(cause);
    });

    it('should return non-object causes unchanged', () => {
      expect(sanitizeCause('plain string cause')).toBe('plain string cause');
      expect(sanitizeCause(undefined)).toBeUndefined();
    });

    it('should not loop forever on a circular cause chain', () => {
      const circular: Record<string, unknown> = { message: 'circular' };
      circular['cause'] = circular;

      expect(() => sanitizeCause(circular)).not.toThrow();
    });
  });
});
