import { ServiceDiscovery } from '@shadow-library/common';

import { InternalApiErrorCode } from './internal-api-error-code';
import { type ServiceFetch, type ServiceTarget } from './service-fetch';
import { type CallOptions, type ServiceErrorBody, type ServiceResponse } from './service-response';

export type ServiceMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ServiceRequest extends CallOptions {
  method: ServiceMethod;
  path: string;
  body?: unknown;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function signalOf(options: CallOptions): AbortSignal | undefined {
  const signals = [options.signal, options.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs)].filter(signal => signal !== undefined);
  return signals.length > 1 ? AbortSignal.any(signals) : signals[0];
}

function parsePayload(text: string): unknown {
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorBodyOf(payload: unknown): ServiceErrorBody {
  if (typeof payload !== 'object' || payload === null) return {};
  const { code, message } = payload as Record<string, unknown>;
  return { ...(typeof code === 'string' && { code }), ...(typeof message === 'string' && { message }) };
}

/** Answers every HTTP status as a value, so each caller keeps its own policy for a refusal; only a call that got no answer throws. */
export async function callService<T>(fetchFn: ServiceFetch, target: ServiceTarget, request: ServiceRequest): Promise<ServiceResponse<T>> {
  const headers = new Headers({ accept: 'application/json' });
  if (request.body !== undefined) headers.set('content-type', 'application/json');
  const init: RequestInit = { method: request.method, headers, signal: signalOf(request) };
  if (request.body !== undefined) init.body = JSON.stringify(request.body);

  const unreachable = (error: unknown): never => {
    if (request.signal?.aborted) throw error;
    throw InternalApiErrorCode.SERVICE_UNREACHABLE.create({ service: target.service, reason: reasonOf(error) }, error);
  };

  const url = ServiceDiscovery.resolve(`svc://${target.service}${request.path}`);
  const response = await fetchFn(url, init, { resource: target.resource, scopes: target.scopes }).catch(unreachable);
  const payload = parsePayload(await response.text().catch(unreachable));
  if (response.ok) return { ok: true, status: response.status, headers: response.headers, data: payload as T };
  return { ok: false, status: response.status, headers: response.headers, error: errorBodyOf(payload) };
}

export function pathParam(value: string | number | bigint): string {
  return encodeURIComponent(String(value));
}
