/**
 * Importing npm packages
 */
import { Handler, type HandlerMetadata } from '@shadow-library/app';
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
const ALLOW_DURING_DELETION: unique symbol = Symbol('shadow-memoir:allow-during-deletion');

/**
 * Opts a route out of the `ACC_002` refusal every other authenticated surface gets once
 * `accounts.deletion_state` leaves `none` (ARCHITECTURE §21). Only the deletion surface itself may
 * carry it — a started deletion has to stay observable and a repeat start has to answer with the
 * current state rather than a refusal.
 */
export const AllowDuringDeletion = (): ClassDecorator & MethodDecorator => Handler({ [ALLOW_DURING_DELETION]: true });

/**
 * Resolves the caller's account after `AuthGuard` sets the principal, so every downstream handler and
 * `OwnerScopedRepository.scoped()` call can read it back synchronously. The guard runs a stage earlier,
 * on `preValidation`, so the principal is already in context by the time any `preHandler` runs; the
 * weight only orders this against the other `preHandler` middlewares. Only user principals get
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

    const allowDuringDeletion = metadata[ALLOW_DURING_DELETION] === true;
    return async (): Promise<void> => {
      const principal = this.context.getAuthPrincipalOrNull();
      if (!principal || principal.kind !== 'user') return;
      await this.accountContext.resolve(principal.sub, allowDuringDeletion);
    };
  }
}
