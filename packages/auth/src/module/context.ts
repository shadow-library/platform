import { ContextService } from '@shadow-library/fastify';

import { type AuthPrincipal } from '../interfaces';
import { AuthGuardErrorCode } from './errors';

declare module '@shadow-library/fastify' {
  interface ContextExtension {
    /** Returns the principal the auth guard resolved for the current request; throws 401 when the route ran unauthenticated */
    getAuthPrincipal(): AuthPrincipal;

    /** Returns the principal for the current request, or `null` on unauthenticated routes */
    getAuthPrincipalOrNull(): AuthPrincipal | null;
  }

  /** Surfaces the extension methods on the class type (`implements` alone does not add members) */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ContextService extends ContextExtension {}
}

export const AUTH_PRINCIPAL: unique symbol = Symbol('shadow-library:auth-principal');

export function extendContextWithAuth(context: ContextService): void {
  context.extend({
    getAuthPrincipal(): AuthPrincipal {
      const principal = this.get<AuthPrincipal>(AUTH_PRINCIPAL);
      if (!principal) throw AuthGuardErrorCode.IAM_001.create();
      return principal;
    },

    getAuthPrincipalOrNull(): AuthPrincipal | null {
      return this.get<AuthPrincipal>(AUTH_PRINCIPAL);
    },
  });
}
