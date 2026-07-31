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

/**
 * Declaring the constants
 */
const unexpectedError = ServerErrorCode.S001.create();
const invalidRequestError = ServerErrorCode.S006.create();

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
    this.logger.warn('Handling error', err);
    if (err.cause) this.logger.warn('Caused by', err.cause);
    const { statusCode, error } = this.handleError(err);
    const payload = this.isStackTraceEnabled ? { ...error, stack: err.stack } : error;
    return res.status(statusCode).send(payload);
  }
}
