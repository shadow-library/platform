/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { isApiError } from '../lib/api-error';

/**
 * Defining types
 */

/**
 * The query the identity provider appends when it turns a user away from an application it will not
 * let them enter. Every field is optional because the deny paths carry different amounts: the OAuth
 * authorize redirect names the application and the client, the SAML one names neither.
 */
export interface AccessDeniedSearch {
  error?: string;
  /** The provider's own wording; it knows the specific reason in a way a generic page cannot. */
  error_description?: string;
  request_id?: string;
  /** Display name of the application access was refused to. */
  application?: string;
  client_id?: string;
}

/**
 * Declaring the constants
 */

/** RFC 6749 §4.1.2.1. The provider sends it verbatim, so callers compare against this rather than a literal. */
export const ACCESS_DENIED = 'access_denied';

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

/**
 * Reads the deny query off a route's search params, dropping anything that is not a non-empty string.
 *
 * Shaped for a TanStack Router `validateSearch`. It lives here rather than in each application because
 * the contract is the identity provider's, and five applications parsing it five ways is five chances
 * to render a blank page over a denial that did explain itself.
 */
export function parseAccessDeniedSearch(search: Record<string, unknown>): AccessDeniedSearch {
  return {
    error: text(search.error),
    error_description: text(search.error_description),
    request_id: text(search.request_id),
    application: text(search.application),
    client_id: text(search.client_id),
  };
}

/** Whether a parsed query is a refusal rather than some other provider error. */
export function isAccessDeniedSearch(search: AccessDeniedSearch): boolean {
  return search.error === ACCESS_DENIED;
}

/**
 * Whether a failed request was refused for want of access rather than for want of a session.
 *
 * A 401 means "sign in", which the auth gate already handles by bouncing to login; a 403 means signing
 * in again changes nothing, so bouncing would loop. This is the check that tells the two apart at an
 * API boundary — the counterpart to {@link isAccessDeniedSearch} on the redirect path.
 */
export function isAccessDeniedError(error: unknown): boolean {
  return isApiError(error) && error.status === 403;
}
