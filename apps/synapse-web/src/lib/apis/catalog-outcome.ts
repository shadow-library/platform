import { ApiError, type ErrorResponse, isApiError } from '@shadow-library/web';

import { type CatalogInvalidResponse } from './api-types.gen';

export const UNPROCESSABLE = 422;

const CONFLICT = 409;

const FORBIDDEN = 403;

const CATALOG_INVALID = 'SYN_CATALOG_INVALID';

export function isCatalogConflict(error: unknown): boolean {
  return isApiError(error) && error.status === CONFLICT;
}

export function isForbidden(error: unknown): boolean {
  return isApiError(error) && error.status === FORBIDDEN;
}

export type CatalogWriteOutcome<T> = { kind: 'done'; value: T } | { kind: 'invalid'; issues: CatalogInvalidResponse['issues'] };

/**
 * A catalog write answers 422 with its issues as part of the contract, so the request models that status and this tells the two bodies
 * apart by the error `code` only an error body carries. Any other 422, such as a body that failed schema validation, is still an error.
 */
export function catalogWriteOutcome<T extends object>(body: T | CatalogInvalidResponse): CatalogWriteOutcome<T> {
  const code = (body as { code?: unknown }).code;
  if (typeof code !== 'string') return { kind: 'done', value: body as T };
  const failure = body as CatalogInvalidResponse;
  if (code === CATALOG_INVALID) return { kind: 'invalid', issues: Array.isArray(failure.issues) ? failure.issues : [] };
  throw new ApiError(UNPROCESSABLE, { type: 'CLIENT_ERROR', ...(body as Partial<ErrorResponse>), code, message: failure.message ?? 'The request was rejected' });
}
