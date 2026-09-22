/**
 * Importing npm packages
 */
import { type Provider } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { type AuthClientConfig } from '../interfaces';
import { AuthClient } from '../lib/auth-client';
import { AppSessionService } from '../module/app-session.service';
import { type AuthRoutePaths, type BrowserAuthOptions, resolveAuthRoutes, resolveBrowserAuthConfig } from '../module/config';
import { createTestIdP, type TestIdP, type TestIdPOptions, type TestTokenInput } from './test-idp';

/**
 * Defining types
 */

export interface OfflineAuthOptions extends Omit<TestIdPOptions, 'serve'> {
  browser?: BrowserAuthOptions;
  routes?: Partial<AuthRoutePaths>;
}

export interface OfflineAuth {
  idp: TestIdP;

  /** A real `AuthClient` wired to `idp` in-process; it holds client credentials, so every M2M path works */
  client: AuthClient;

  sessions: AppSessionService;

  /** `ShadowFactory.create(AppModule, { overrides: auth.providers })` replaces the SDK's own client and session service */
  providers: Provider[];

  /** `idp.issueToken`, addressed to this application's audience unless the input names another */
  issueToken(input: TestTokenInput): Promise<string>;

  /** Releases the service-access refresh timer the client starts once its rules are loaded */
  stop(): void;
}

/**
 * Declaring the constants
 */
const DEFAULT_APP_ID = 'offline-app';
const DEFAULT_CLIENT_SECRET = 'offline-secret';

/**
 * The real auth SDK against an unserved `TestIdP`: discovery, JWKS, token, PDP, role sync, service
 * access and app sessions are all answered in-process, so verification and authorisation run their
 * genuine code paths with no network. As boot overrides, the replaced client and session service are
 * what `AuthModule`'s startup warm-up, role sync and service-access load talk to.
 */
export async function createOfflineAuth(options: OfflineAuthOptions = {}): Promise<OfflineAuth> {
  const appId = options.clientId ?? DEFAULT_APP_ID;
  const secret = options.clientSecret ?? DEFAULT_CLIENT_SECRET;
  const idp = await createTestIdP({ ...options, clientId: appId, clientSecret: secret, serve: false });

  const config: AuthClientConfig = { issuer: idp.issuer, appId, client: { id: appId, secret }, fetch: idp.transport };
  const client = new AuthClient(config);
  const browser = resolveBrowserAuthConfig(config, resolveAuthRoutes(options.routes), { enabled: true, ...options.browser });
  const sessions = new AppSessionService(client, browser);

  return {
    idp,
    client,
    sessions,
    providers: [
      { token: AuthClient, useFactory: () => client },
      { token: AppSessionService, useFactory: () => sessions },
    ],
    issueToken: input => idp.issueToken({ audience: idp.getAppRegistration().audience, ...input }),
    stop: () => client.stop(),
  };
}
