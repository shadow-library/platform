import { type DynamicModule, Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';

import { AUTH_ROUTES_BASE_PATH } from './auth.constants';
import { RouteGuardSentinel } from './route-guard.sentinel';

/**
 * The SDK derives audience, redirect URIs and scopes from `GET {issuer}/api/v1/apps/me`; `RouteGuardSentinel` exists because the SDK guard is opt-in per route.
 * Role sync stays off (`roles` unset): identity's BootstrapService seeds the RBAC catalog, and code-owned sync would need the client granted `authz:roles:sync`.
 */
@Module({})
export class SessionModule {
  static forRoot(): DynamicModule {
    return {
      module: SessionModule,
      imports: [AuthModule.forRoot({ routes: { basePath: AUTH_ROUTES_BASE_PATH } }), FastifyModule],
      controllers: [RouteGuardSentinel],
    };
  }
}
