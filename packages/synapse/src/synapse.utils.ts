import { type AppError, ErrorCode } from '@shadow-library/common/errors';

import { type SynapseEnvelopeInput } from './synapse-api.types';
import { type SynapseEnvelope } from './synapse.types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function networkError(error: unknown): AppError {
  return ErrorCode.API_REQUEST_NETWORK_ERROR.create({ reason: reasonOf(error) }, error);
}

export function withRequestId(envelope: SynapseEnvelopeInput): SynapseEnvelope {
  return { ...envelope, request_id: envelope.request_id || crypto.randomUUID() };
}
