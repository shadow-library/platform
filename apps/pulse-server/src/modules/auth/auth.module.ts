/**
 * Importing npm packages
 */
import { type DynamicModule, Module } from '@shadow-library/app';
import { type AuthClientCredential } from '@shadow-library/auth';
import { AuthModule, type AuthModuleOptions, RelyingPartyModule } from '@shadow-library/auth/module';
import { AppError, Config, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { PULSE_AUDIENCE } from './rbac.constants';
import { RouteGuardSentinel } from './route-guard.sentinel';
import { SessionController } from './session.controller';

/**
 * Defining types
 */

type ResolvedAuthOptions = AuthModuleOptions & { issuer: string; audience: string; client: AuthClientCredential };

/**
 * Declaring the constants
 *
 * Pulse standardises on `@shadow-library/auth/module` for bearer verification, scope checks, PDP
 * permission checks, and M2M service-access enforcement; only the default-deny sentinel and the
 * first-party session surface are pulse-native. The SDK loads the `AUTH_*` environment configs
 * itself (without defaults), so the dev fallbacks and prod fail-fast guarantees pulse used to get
 * from `Config.load` options are applied here instead: in production a missing issuer or client
 * credential aborts the boot rather than silently falling back to a development default.
 *
 * `forRoot` resolves the config when it is called (from `dynamic.modules.ts`) rather than at
 * module-import time, so tests can point the SDK at a per-file mock IdP before the application
 * module graph is loaded.
 *
 * Role sync is deliberately NOT enabled (`roles` unset): the pulse RBAC catalog is still seeded by
 * the identity BootstrapService, and enabling code-owned sync would require the pulse client to be
 * granted the `authz:roles:sync` scope first.
 */
const DEV_ISSUER = 'http://localhost:8080';
const DEV_CLIENT_ID = 'pulse';
const DEV_CLIENT_SECRET = 'dev-only-insecure-pulse-client-secret';

const RP_CALLBACK_PATH = '/api/auth/callback';

/** A wrong trust anchor in production means honouring tokens from the wrong authority, so it must never default there */
function resolveAuthOptions(): ResolvedAuthOptions {
  const issuer = Config.get('auth.issuer') ?? (Config.isProd() ? throwError(AppError.internal(`Environment Variable 'AUTH_ISSUER' not set`)) : DEV_ISSUER);
  const audience = Config.get('auth.audience') ?? PULSE_AUDIENCE;
  const clientId = Config.get('auth.client.id') ?? (Config.isProd() ? throwError(AppError.internal(`Environment Variable 'AUTH_CLIENT_ID' not set`)) : DEV_CLIENT_ID);
  const assertionPath = Config.get('auth.client.assertion-path') || undefined;
  let secret = Config.get('auth.client.secret') || undefined;
  if (!secret && !assertionPath) {
    if (Config.isProd()) throwError(AppError.internal(`Environment Variable 'AUTH_CLIENT_SECRET' or 'AUTH_CLIENT_ASSERTION_PATH' must be set`));
    secret = DEV_CLIENT_SECRET;
  }

  const client: AuthClientCredential = { id: clientId, secret, assertionPath };
  return { issuer, audience, client, identityResource: Config.get('auth.identity-resource') };
}

function resolveRedirectUri(): string {
  const publicUrl = Config.get('app.public-url') ?? `http://localhost:${Config.get('app.port')}`;
  return `${publicUrl.replace(/\/+$/, '')}${RP_CALLBACK_PATH}`;
}

/**
 * The login flow runs as the `pulse` WEB_CONFIDENTIAL relying-party client — the `pulse-server`
 * SERVICE client only holds the `client_credentials` grant, so identity rejects it on the
 * authorization-code flow. Development (and the test IdP) may fall back to the service client.
 */
function resolveRelyingPartyClient(serviceClient: AuthClientCredential): AuthClientCredential {
  const id = Config.get('app.client.id');
  if (!id) return Config.isProd() ? throwError(AppError.internal(`Environment Variable 'APP_CLIENT_ID' not set`)) : serviceClient;
  const secret = Config.get('app.client.secret') || (Config.isProd() ? throwError(AppError.internal(`Environment Variable 'APP_CLIENT_SECRET' not set`)) : undefined);
  return { id, secret };
}

@Module({})
export class SessionModule {
  static forRoot(): DynamicModule {
    const options = resolveAuthOptions();
    return {
      module: SessionModule,
      imports: [
        AuthModule.forRoot(options),
        RelyingPartyModule.forRoot({ issuer: options.issuer, client: resolveRelyingPartyClient(options.client), redirectUri: resolveRedirectUri() }),
      ],
      controllers: [SessionController, RouteGuardSentinel],
    };
  }
}
