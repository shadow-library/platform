import { ServerErrorCode } from '@shadow-library/fastify';

export class AuthGuardErrorCode extends ServerErrorCode {
  /** No valid bearer token accompanied the request */
  static readonly IAM_001 = AuthGuardErrorCode.unauthenticated('IAM_001', 'Authentication required');

  /** The authenticated principal may not perform this operation */
  static readonly IAM_002 = AuthGuardErrorCode.forbidden('IAM_002', 'Permission denied');

  /** Distinct from `IAM_002` because it is actionable: it tells a non-browser client to step up */
  static readonly IAM_003 = AuthGuardErrorCode.forbidden('IAM_003', 'Step-up authentication required');
}
