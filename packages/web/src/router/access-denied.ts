import { isApiError } from '../lib/api-error';

/** The query the identity provider appends when it denies access to an application; fields are optional because deny paths carry different amounts. */
export interface AccessDeniedSearch {
  error?: string;
  /** The provider's own wording, which knows the specific reason. */
  error_description?: string;
  request_id?: string;
  /** Display name of the application access was refused to. */
  application?: string;
  client_id?: string;
}

/** RFC 6749 §4.1.2.1 error code, sent verbatim by the provider. */
export const ACCESS_DENIED = 'access_denied';

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

/** Shaped for a TanStack Router `validateSearch`; drops anything that is not a non-empty string. */
export function parseAccessDeniedSearch(search: Record<string, unknown>): AccessDeniedSearch {
  return {
    error: text(search.error),
    error_description: text(search.error_description),
    request_id: text(search.request_id),
    application: text(search.application),
    client_id: text(search.client_id),
  };
}

export function isAccessDeniedSearch(search: AccessDeniedSearch): boolean {
  return search.error === ACCESS_DENIED;
}

/**
 * Whether a failed request was refused for want of access rather than for want of a session.
 * A 401 is the auth gate's job (bounce to login); a 403 means signing in again changes nothing, so bouncing would loop.
 */
export function isAccessDeniedError(error: unknown): boolean {
  return isApiError(error) && error.status === 403;
}
