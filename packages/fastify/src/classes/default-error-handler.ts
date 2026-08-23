/**
 * Importing npm packages
 */
import { FastifyError } from 'fastify';
import { AppError, AppErrorObject, Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '@lib/constants';

import { ErrorHandler, HttpRequest, HttpResponse } from '../interfaces';
import { ServerErrorCode } from '../server.error';

/**
 * Defining types
 */

export interface ParsedFastifyError {
  statusCode: number;
  error: AppErrorObject;
}

interface BoundQueryError {
  message: string;
  stack?: string;
  query: string;
  params: unknown[];
}

/**
 * Declaring the constants
 */
const unexpectedError = ServerErrorCode.S001.create();
const invalidRequestError = ServerErrorCode.S006.create();
const STACK_FRAME_LINE = /^\s*at\s/;

function isBoundQueryError(value: Record<string, unknown>): value is Record<string, unknown> & BoundQueryError {
  return typeof value['query'] === 'string' && Array.isArray(value['params']);
}

/**
 * Drizzle/bun-sql query-failure errors interpolate the statement's bound parameter values into
 * `message`/`stack`/`params` as positional text rather than named fields, so a manifest-driven,
 * field-name redactor can never reach them. Walks the `.cause` chain and rebuilds any such node with
 * its parameter values elided, keeping the SQL text (placeholders only) for diagnosis.
 */
export function sanitizeCause(cause: unknown, seen: WeakSet<object> = new WeakSet<object>()): unknown {
  if (typeof cause !== 'object' || cause === null || seen.has(cause)) return cause;
  seen.add(cause);

  const record = cause as Record<string, unknown>;
  const sanitizedNestedCause = sanitizeCause(record['cause'], seen);
  if (!isBoundQueryError(record)) {
    if (sanitizedNestedCause === record['cause']) return cause;
    return { ...record, message: record['message'], stack: record['stack'], cause: sanitizedNestedCause };
  }

  const message = `Failed query: ${record.query} -- ${record.params.length} bound param(s) redacted`;
  const stackLines = record.stack?.split('\n') ?? [];
  const frameIndex = stackLines.findIndex(line => STACK_FRAME_LINE.test(line));
  const frames = frameIndex === -1 ? [] : stackLines.slice(frameIndex);

  return { ...record, cause: sanitizedNestedCause, message, stack: [message, ...frames].join('\n'), params: `[${record.params.length} bound param(s) redacted]` };
}

export class DefaultErrorHandler implements ErrorHandler {
  private readonly logger = Logger.getLogger(NAMESPACE, 'DefaultErrorHandler');
  private readonly isStackTraceEnabled = Config.get('app.dev.stack-trace');

  constructor() {
    if (this.isStackTraceEnabled && Config.isProd()) this.logger.warn('Stack trace logging is enabled in production');
  }

  protected parseFastifyError(err: FastifyError): ParsedFastifyError {
    if (err.statusCode === 500) return { statusCode: 500, error: unexpectedError.toResponse() };
    return { statusCode: err.statusCode as number, error: { ...invalidRequestError.toResponse(), message: err.message } };
  }

  private handleError(err: Error): ParsedFastifyError {
    if (AppError.is(err)) return { statusCode: err.status, error: err.toResponse() };
    if (err.name === 'FastifyError') return this.parseFastifyError(err as FastifyError);

    this.logger.error('Unhandled error has occurred', err);
    return { statusCode: unexpectedError.status, error: unexpectedError.toResponse() };
  }

  handle(err: Error, _req: HttpRequest, res: HttpResponse): HttpResponse {
    const sanitizedCause = err.cause === undefined ? undefined : sanitizeCause(err.cause);
    this.logger.warn('Handling error', sanitizedCause === err.cause ? err : { ...err, message: err.message, stack: err.stack, cause: sanitizedCause });
    if (err.cause) this.logger.warn('Caused by', sanitizedCause);
    const { statusCode, error } = this.handleError(err);
    const payload = this.isStackTraceEnabled ? { ...error, stack: err.stack } : error;
    return res.status(statusCode).send(payload);
  }
}
