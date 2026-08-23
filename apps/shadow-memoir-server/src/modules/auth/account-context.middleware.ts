/**
 * Importing npm packages
 */
import { type HandlerMetadata } from '@shadow-library/app';
import { AUTH_ROUTE_METADATA, type AuthRouteMetadata } from '@shadow-library/auth/module';
import { type AsyncRouteHandler, ContextService, Middleware } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AccountContext } from './account-context';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Resolves the caller's account immediately after `AuthGuard` (weight 100) sets the principal, so
 * every downstream handler and `OwnerScopedRepository.scoped()` call can read it back synchronously. A
 * lower weight runs later on the same `preHandler` hook (the `ProjectOwnershipGuard` precedent, weight
 * 50, documents this explicitly), so this sits just under `AuthGuard`'s 100. Only user principals get
 * an account — service callers reach user-owned tables exclusively through
 * `OwnerScopedRepository.forAccount()`, never this context, so a service token resolves nothing here.
 */
@Middleware({ type: 'preHandler', weight: 90 })
export class AccountContextMiddleware {
  constructor(
    private readonly context: ContextService,
    private readonly accountContext: AccountContext,
  ) {}

  cacheKey(metadata: HandlerMetadata): string {
    return `shadow-memoir:account-context:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): AsyncRouteHandler | undefined {
    const auth = metadata[AUTH_ROUTE_METADATA] as AuthRouteMetadata | undefined;
    if (!auth?.authenticated) return undefined;

    return async (): Promise<void> => {
      const principal = this.context.getAuthPrincipalOrNull();
      if (!principal || principal.kind !== 'user') return;
      await this.accountContext.resolve(principal.sub);
    };
  }
}
