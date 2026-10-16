import { type AuthPrincipal } from '@shadow-library/auth';
import { AuthGuardErrorCode } from '@shadow-library/auth/module';

/** The auth guard admits a user that holds the scope too; only an M2M token names the calling app, as its client id */
export function callingApp(principal: AuthPrincipal): string {
  if (principal.kind !== 'service' || !principal.clientId) throw AuthGuardErrorCode.IAM_002.create();
  return principal.clientId;
}
