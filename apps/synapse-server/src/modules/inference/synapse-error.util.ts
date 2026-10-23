import { AppError, type FieldError } from '@shadow-library/common';
import { type SynapseErrorBody } from '@shadow-library/synapse';

export type SynapseErrorType = 'invalid_request_error' | 'authentication_error' | 'rate_limit_error' | 'server_error';

export interface RenderedError {
  code: string;
  message: string;
  fields?: Pick<FieldError, 'field' | 'msg'>[];
}

const API_PREFIX = '/api/v1/';
const ADMIN_PREFIX = '/api/v1/admin';
const INPUT_PART = /^(body|params|querystring)\./;

/** Inference and catalog routes answer in OpenAI's error shape, which the OpenAI SDK reads `code` from; the admin routes keep the platform's */
export function rendersSynapseErrors(url: string): boolean {
  const path = url.split('?', 1)[0] ?? '';
  if (!path.startsWith(API_PREFIX)) return false;
  return path !== ADMIN_PREFIX && !path.startsWith(`${ADMIN_PREFIX}/`);
}

export function errorTypeFor(status: number): SynapseErrorType {
  if (status === 401 || status === 403) return 'authentication_error';
  if (status === 429) return 'rate_limit_error';
  if (status >= 500) return 'server_error';
  return 'invalid_request_error';
}

function paramOf(rendered: RenderedError, error: unknown): string | undefined {
  const field = rendered.fields?.[0]?.field;
  if (field) return field.replace(INPUT_PART, '');
  if (!AppError.is(error) || error.isInternal) return undefined;
  const param: unknown = error.data?.['param'];
  return typeof param === 'string' ? param : undefined;
}

function messageOf(rendered: RenderedError): string {
  const fields = rendered.fields ?? [];
  if (fields.length === 0) return rendered.message;
  return fields.map(({ field, msg }) => `${field.replace(INPUT_PART, '')}: ${msg}`).join('; ');
}

export function synapseErrorBody(status: number, rendered: RenderedError, error?: unknown): SynapseErrorBody {
  const param = paramOf(rendered, error);
  return { error: { message: messageOf(rendered), type: errorTypeFor(status), code: rendered.code, ...(param === undefined ? {} : { param }) } };
}

export function errorBodyOf(error: AppError): SynapseErrorBody {
  return synapseErrorBody(error.status, error.toResponse(), error);
}
