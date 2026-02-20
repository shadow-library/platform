/**
 * Importing npm packages
 */
import { AppError, AppErrorObject, Config, Logger, ValidationError } from '@shadow-library/common';
import { FastifyError } from 'fastify';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '@lib/constants';

import { ErrorHandler, HttpRequest, HttpResponse } from '../interfaces';
import { ServerError, ServerErrorCode } from '../server.error';

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
const unexpectedError = new ServerError(ServerErrorCode.S001);
const validationError = new ServerError(ServerErrorCode.S003);
const invalidRequestError = new ServerError(ServerErrorCode.S006);

export class DefaultErrorHandler implements ErrorHandler {
  private readonly logger = Logger.getLogger(NAMESPACE, 'DefaultErrorHandler');
  private readonly isStackTraceEnabled = Config.get('app.dev.stack-trace');

  constructor() {
    if (this.isStackTraceEnabled && Config.isProd()) this.logger.warn('Stack trace logging is enabled in production');
  }

  protected parseFastifyError(err: FastifyError): ParsedFastifyError {
    if (err.statusCode === 500) return { statusCode: 500, error: unexpectedError.toObject() };
    return { statusCode: err.statusCode as number, error: { ...invalidRequestError.toObject(), message: err.message } };
  }

  private handleError(err: Error): ParsedFastifyError {
    if (err instanceof ServerError) return { statusCode: err.getStatusCode(), error: err.toObject() };
    else if (err instanceof ValidationError) return { statusCode: validationError.getStatusCode(), error: { ...err.toObject(), ...validationError.toObject() } };
    else if (err instanceof AppError) return { statusCode: 500, error: err.toObject() };
    else if (err.name === 'FastifyError') return this.parseFastifyError(err as FastifyError);

    this.logger.error('Unhandled error has occurred', err);
    return { statusCode: unexpectedError.getStatusCode(), error: unexpectedError.toObject() };
  }

  handle(err: Error, _req: HttpRequest, res: HttpResponse): HttpResponse {
    this.logger.warn('Handling error', err);
    if (err.cause) this.logger.warn('Caused by', err.cause);
    const { statusCode, error } = this.handleError(err);
    const payload = this.isStackTraceEnabled ? { ...error, stack: err.stack } : error;
    return res.status(statusCode).send(payload);
  }
}
