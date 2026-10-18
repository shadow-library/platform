import { ServerErrorCode } from '@shadow-library/fastify';

export class AppErrorCode extends ServerErrorCode {
  static readonly SYN_UNKNOWN_TASK = AppErrorCode.notFound('SYN_UNKNOWN_TASK', 'Unknown task');
  /** The task's app prefix differs from the calling app's client id */
  static readonly SYN_TASK_FORBIDDEN = AppErrorCode.forbidden('SYN_TASK_FORBIDDEN', 'The task belongs to another application');
  static readonly SYN_ALIAS_UNAVAILABLE = AppErrorCode.validation('SYN_ALIAS_UNAVAILABLE', 'The alias is not available for this task');
  static readonly SYN_NO_ELIGIBLE_MODEL = AppErrorCode.validation('SYN_NO_ELIGIBLE_MODEL', 'No model deployment can serve this request');
  static readonly SYN_BUDGET_CALLS = AppErrorCode.badRequest('SYN_BUDGET_CALLS', 'The call budget for the current window is exhausted', 429);
  static readonly SYN_BUDGET_COST = AppErrorCode.badRequest('SYN_BUDGET_COST', 'The cost budget for the current window is exhausted', 429);
  static readonly SYN_POLICY_DENIED = AppErrorCode.forbidden('SYN_POLICY_DENIED', 'The request is denied by policy');
  static readonly SYN_PROVIDERS_EXHAUSTED = AppErrorCode.unavailable('SYN_PROVIDERS_EXHAUSTED', 'Every provider deployment failed: {reason}');
  static readonly SYN_UPSTREAM_ERROR = AppErrorCode.unavailable('SYN_UPSTREAM_ERROR', 'The upstream provider returned an error: {reason}', 502);
  static readonly SYN_INVALID_REQUEST = AppErrorCode.badRequest('SYN_INVALID_REQUEST', 'Invalid request');
  static readonly SYN_CATALOG_INVALID = AppErrorCode.validation('SYN_CATALOG_INVALID', 'The catalog document is invalid');
  static readonly SYN_CATALOG_CONFLICT = AppErrorCode.conflict('SYN_CATALOG_CONFLICT', 'The catalog changed concurrently; reload it and retry');
  static readonly SYN_NO_ACTIVE_CATALOG = AppErrorCode.unavailable('SYN_NO_ACTIVE_CATALOG', 'No catalog has been published');
  static readonly SYN_TIMEOUT = AppErrorCode.unavailable('SYN_TIMEOUT', 'The request timed out', 504);
  static readonly SYN_DUPLICATE_REQUEST = AppErrorCode.conflict('SYN_DUPLICATE_REQUEST', 'The request_id was already used');

  /** Admin-only credential errors, outside the `SYN_*` wire contract that calling apps see */
  static readonly CRED_NAME_TAKEN = AppErrorCode.conflict('CRED_NAME_TAKEN', 'A credential with this name already exists');
  /** Carries `referencedBy`, the provider keys of the published catalog that still use the credential */
  static readonly CRED_IN_USE = AppErrorCode.conflict('CRED_IN_USE', 'The published catalog still uses this credential');
  static readonly CRED_REVOKED = AppErrorCode.conflict('CRED_REVOKED', 'The credential is revoked');

  /** A route reached the default-deny sentinel without declaring an access policy; outside the `SYN_*` wire contract because only a server defect raises it */
  static readonly SEC_003 = AppErrorCode.forbidden('SEC_003', 'Access denied');
}
