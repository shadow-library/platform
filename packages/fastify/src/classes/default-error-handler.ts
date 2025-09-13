/**
 * Importing npm packages
 */
import { AppError, AppErrorObject, Logger, ValidationError } from '@shadow-library/common';
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

  protected parseFastifyError(err: FastifyError): ParsedFastifyError {
    if (err.statusCode === 500) return { statusCode: 500, error: unexpectedError.toObject() };
    return { statusCode: err.statusCode as number, error: { ...invalidRequestError.toObject(), message: err.message } };
  }

  handle(err: Error, _req: HttpRequest, res: HttpResponse): HttpResponse {
    this.logger.warn('Handling error', err);
    if (err.cause) this.logger.warn('Caused by', err.cause);
    if (err instanceof ServerError) return res.status(err.getStatusCode()).send(err.toObject());
    else if (err instanceof ValidationError) return res.status(400).send({ ...err.toObject(), code: validationError.getCode() });
    else if (err instanceof AppError) return res.status(500).send(err.toObject());
    else if (err.name === 'FastifyError') {
      const { statusCode, error } = this.parseFastifyError(err as FastifyError);
      return res.status(statusCode).send(error);
    }

    this.logger.error('Unhandled error has occurred', err);
    return res.status(500).send(unexpectedError.toObject());
  }
}
