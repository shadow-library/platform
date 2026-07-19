/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { type JwtClaims } from '@server/modules/auth/keys';

import { type AuthenticatedRequest, type ClientInfo } from './access.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Handlers read the guard-resolved identity through the ambient `Context` (see `./context`), not
 * through per-handler accessors. What remains here is used by the guard itself before a context
 * exists (`clientInfoOf`) and by service-token callers (`serviceClientId`).
 */

/** Reads the raw client network identity from the request; safe on unauthenticated routes. */
export function clientInfoOf(request: AuthenticatedRequest): ClientInfo {
  const userAgent = request.headers['user-agent'];
  return { ip: request.ip, userAgent: typeof userAgent === 'string' ? userAgent : undefined };
}

/** Extracts the caller's client id from a verified service token, preferring `client_id` then `sub`. */
export function serviceClientId(claims: JwtClaims): string {
  const clientId = typeof claims.client_id === 'string' ? claims.client_id : typeof claims.sub === 'string' ? claims.sub : '';
  if (!clientId) throw AppErrorCode.AUTHZ_002.create();
  return clientId;
}
