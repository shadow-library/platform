import { type DynamicModule, Module } from '@shadow-library/app';
import { AuthModule } from '@shadow-library/auth/module';

import { AUTH_ROUTES_BASE_PATH } from './auth.constants';
import { RouteGuardSentinel } from './route-guard.sentinel';

/**
 * Pulse standardises on `@shadow-library/auth/module` for the entire auth stack: bearer verification,
 * scope checks, PDP permission checks, M2M service-access enforcement, and — since the v1.1 SDK — the
 * complete first-party browser login flow (`GET /api/auth/login|callback|session|step-up`,
 * `POST /api/auth/logout`). The only pulse-native delta is the default-deny `RouteGuardSentinel`,
 * which the SDK deliberately lacks (its guard is opt-in per route).
 *
 * `AuthModule.forRoot` derives everything a deploy used to restate — audience, redirect URIs, granted
 * scopes — from `GET {issuer}/api/v1/apps/me`, so pulse configures nothing but the route base path
 * here; `AUTH_ISSUER`, `AUTH_APP_ID` and one client credential come from the environment (see
 * `CLAUDE.md`). Role sync stays off (`roles` unset): the pulse RBAC catalog is seeded by identity's
 * BootstrapService, and code-owned sync would first need the client granted `authz:roles:sync`.
 *
 * `forRoot` resolves its config when it is called (deferred from `dynamic.modules.ts`) rather than at
 * module-import time, so tests can point the SDK at a per-file mock IdP before the module graph loads.
 */
@Module({})
export class SessionModule {
  static forRoot(): DynamicModule {
    return {
      module: SessionModule,
      imports: [AuthModule.forRoot({ routes: { basePath: AUTH_ROUTES_BASE_PATH } })],
      controllers: [RouteGuardSentinel],
    };
  }
}
