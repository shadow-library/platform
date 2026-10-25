import { asRecord, parseJson } from './upstream-payload.util';

export type ProviderFailureCode =
  | 'connect'
  | 'capacity'
  | 'timeout'
  | 'aborted'
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'revoked_api_key'
  | 'credential_origin_mismatch'
  | 'credential_unreadable'
  | 'redirected'
  | 'invalid_session'
  | 'invalid_request'
  | 'unsupported'
  | 'invalid_response'
  | 'stream_truncated'
  | 'upstream_read'
  | 'unsupported_parameter';

export interface ProviderCallErrorInit {
  retryable: boolean;
  message: string;
  status?: number;
  /** One of `ProviderFailureCode`, or the upstream's own `error.code` */
  code?: string;
  /** Whether any chunk of a stream had already been handed on when it failed */
  bytesSent?: boolean;
  cause?: unknown;
}

const MAX_MESSAGE_LENGTH = 300;
const RETRYABLE_STATUSES = new Set([408, 429]);
const RETRYABLE_STREAM_ERROR_TYPES = new Set(['rate_limit_error', 'server_error']);

/**
 * A failed upstream call, classified for failover; dispatch turns it into a `SYN_*` error. `message` is the upstream's own JSON
 * `error.message` (and that of the provider OpenRouter routed to), trimmed, or a fixed reason: never a raw body, the request or a credential.
 */
export class ProviderCallError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  readonly code?: string;
  readonly bytesSent: boolean;

  constructor(init: ProviderCallErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = ProviderCallError.name;
    this.retryable = init.retryable;
    this.bytesSent = init.bytesSent ?? false;
    if (init.status !== undefined) this.status = init.status;
    if (init.code !== undefined) this.code = init.code;
  }
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

export function trimUpstreamMessage(message: string): string {
  const collapsed = message.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_MESSAGE_LENGTH ? `${collapsed.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : collapsed;
}

export function upstreamErrorOf(payload: unknown): Record<string, unknown> | undefined {
  return asRecord(asRecord(payload)?.['error']);
}

function stringCode(error: Record<string, unknown> | undefined): string | undefined {
  const code = error?.['code'];
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** OpenRouter reports a routed provider's refusal as "Provider returned error" and puts that provider's own body in `metadata.raw` */
function routedReason(error: Record<string, unknown> | undefined): string | undefined {
  const metadata = asRecord(error?.['metadata']);
  const raw = metadata?.['raw'];
  const reason = nonEmpty(upstreamErrorOf(typeof raw === 'string' ? parseJson(raw) : raw)?.['message']);
  if (!reason) return undefined;
  const provider = nonEmpty(metadata?.['provider_name']);
  return provider ? `${provider}: ${reason}` : reason;
}

function messageOf(error: Record<string, unknown> | undefined, fallback: string): string {
  const text = nonEmpty(error?.['message']) ?? fallback;
  const reason = routedReason(error);
  return trimUpstreamMessage(reason ? `${text} (${reason})` : text) || fallback;
}

export function classifyHttpFailure(status: number, bodyText: string): ProviderCallError {
  const error = upstreamErrorOf(parseJson(bodyText));
  const code = stringCode(error);
  const retryable = isRetryableStatus(status) || (status === 400 && code === 'unsupported_parameter');
  return new ProviderCallError({ retryable, status, ...(code ? { code } : {}), message: messageOf(error, `The upstream answered HTTP ${status}`) });
}

/** A mid-stream `data: {"error":…}` frame, or a 200 response that carries `error` */
export function classifyPayloadError(error: Record<string, unknown>, bytesSent: boolean): ProviderCallError {
  const numeric = typeof error['code'] === 'number' ? error['code'] : typeof error['status'] === 'number' ? error['status'] : undefined;
  const status = numeric !== undefined && Number.isInteger(numeric) && numeric >= 400 && numeric < 600 ? numeric : undefined;
  const code = stringCode(error);
  const type = typeof error['type'] === 'string' ? error['type'] : undefined;
  const retryable =
    !bytesSent && ((status !== undefined && isRetryableStatus(status)) || code === 'unsupported_parameter' || (type !== undefined && RETRYABLE_STREAM_ERROR_TYPES.has(type)));
  return new ProviderCallError({ retryable, bytesSent, ...(status ? { status } : {}), ...(code ? { code } : {}), message: messageOf(error, 'The upstream reported an error') });
}
