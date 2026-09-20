import { forwardRef, type Import, Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { AccountContext } from './account-context';
import { AccountContextMiddleware } from './account-context.middleware';
import { AccountRepository } from './account.repository';

/**
 * The auth SDK's dynamic module carries a live `AuthClient` in a value provider, and `@Module`
 * deep-freezes everything reachable from its metadata. The forwardRef defers construction to module
 * resolution — after the freeze — so the client stays mutable. Mirrors
 * `apps/web-novel-server/src/modules/auth/auth.module.ts` exactly (ARCHITECTURE §3.4).
 */
const DeferredAuthModule = forwardRef(() => AuthModule.forRoot({ routes: { basePath: '/api/auth' } })) as unknown as Import;

/**
 * Wraps the SDK's auth module so this app can layer `AccountContext` resolution on top: after the
 * SDK's own `AuthGuard` resolves the principal, `AccountContextMiddleware` resolves — and, on first
 * contact, creates — the owning `accounts` row for it, refusing the request if that account is
 * mid-deletion. Every user-owned repository reads the result via `OwnerScopedRepository`; nothing else
 * in the app talks to `accounts.identity_sub` directly.
 */
@Module({
  imports: [DeferredAuthModule, FastifyModule, DatabaseModule],
  providers: [AccountRepository, AccountContext],
  controllers: [AccountContextMiddleware],
  exports: [AccountContext, AccountRepository],
})
export class MemoirAuthModule {}
