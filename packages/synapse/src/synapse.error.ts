import { AppError, ErrorCode } from '@shadow-library/common/errors';

import { isRecord } from './synapse.utils';

export interface SynapseErrorDetails {
  param?: string;
  type?: string;
  cause?: unknown;
}

export class SynapseError extends AppError {
  readonly param?: string;
  readonly type?: string;

  constructor(status: number, code: string, message: string, details: SynapseErrorDetails = {}) {
    /** Internal, so an app that lets it bubble answers with the generic face instead of Synapse's upstream detail */
    super(new ErrorCode(code, message, status, true), undefined, details.cause);
    this.param = details.param;
    this.type = details.type;
  }
}

export function isSynapseError(value: unknown): value is SynapseError {
  return value instanceof SynapseError;
}

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export function parseSynapseError(status: number, body: unknown, cause?: unknown): SynapseError {
  const payload = isRecord(body) && isRecord(body.error) ? body.error : body;
  const fields = isRecord(payload) ? payload : {};
  const code = optionalString(fields.code) || ErrorCode.API_REQUEST_FAILED.code;
  const message = optionalString(fields.message) || `Synapse answered http ${status} without a readable error`;
  return new SynapseError(status, code, message, { param: optionalString(fields.param), type: optionalString(fields.type), cause });
}
