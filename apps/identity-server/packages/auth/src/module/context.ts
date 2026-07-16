/**
 * Importing npm packages
 */
import { ContextService } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthGuardErrorCode } from './errors';
import { type AuthPrincipal } from '../interfaces';

/**
 * Defining types
 */

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

/**
 * Declaring the constants
 *
 * The principal lives in the request-scoped context store, keyed by a module-private symbol; the
 * only supported reads are the `getAuthPrincipal*` methods installed onto the app's
 * `ContextService` when `AuthModule` boots.
 */
export const AUTH_PRINCIPAL: unique symbol = Symbol('shadow-library:auth-principal');

/** Installs the auth accessor methods onto the application's context service */
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
