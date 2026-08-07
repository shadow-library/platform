import { AppErrorCode } from '@server/classes';
import { type JwtClaims } from '@server/modules/auth/keys';

import { type AuthenticatedRequest, type ClientInfo } from './access.types';

export function clientInfoOf(request: AuthenticatedRequest): ClientInfo {
  const userAgent = request.headers['user-agent'];
  return { ip: request.ip, userAgent: typeof userAgent === 'string' ? userAgent : undefined };
}

export function serviceClientId(claims: JwtClaims): string {
  const clientId = typeof claims.client_id === 'string' ? claims.client_id : typeof claims.sub === 'string' ? claims.sub : '';
  if (!clientId) throw AppErrorCode.AUTHZ_002.create();
  return clientId;
}
