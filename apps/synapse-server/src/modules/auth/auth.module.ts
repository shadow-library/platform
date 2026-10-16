import { type DynamicModule, Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';
import { FastifyModule } from '@shadow-library/fastify';

import { AUTH_ROUTES_BASE_PATH } from './auth.constants';
import { RouteGuardSentinel } from './route-guard.sentinel';

/** Role sync stays off: identity's bootstrap seeds the catalog in `rbac.constants.ts`, and code-owned sync would first need the client granted `authz:roles:sync`. */
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
