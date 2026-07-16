/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { type AuthClientConfig } from '../interfaces';

/**
 * Defining types
 */

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    /** Auth SDK configs (consumed by `AuthModule.forRoot` / `RelyingPartyModule.forRoot`) */
    'auth.issuer': string;
    'auth.audience': string;
    'auth.client.id': string;
    'auth.client.secret': string;
    'auth.client.assertion-path': string;
  }
}

/** Everything is optional: whatever is not passed in code is resolved from the environment */
export type AuthModuleOptions = Partial<AuthClientConfig>;

/**
 * Declaring the constants
 *
 * Deploys configure the SDK through the environment instead of code: `AUTH_ISSUER` and
 * `AUTH_AUDIENCE` identify the issuer and this service's API resource, while the client either
 * presents a static secret (`AUTH_CLIENT_SECRET`) or — preferred inside Kubernetes — a projected
 * service-account token whose file path is `AUTH_CLIENT_ASSERTION_PATH`.
 */
Config.load('auth.issuer');
Config.load('auth.audience');
Config.load('auth.client.id');
Config.load('auth.client.secret');
Config.load('auth.client.assertion-path');

/** Fills any option not supplied in code from the corresponding `AUTH_*` environment config */
export function resolveAuthClientConfig(options: AuthModuleOptions = {}): AuthClientConfig {
  const issuer = options.issuer ?? Config.get('auth.issuer');
  const audience = options.audience ?? Config.get('auth.audience');

  let client = options.client;
  const clientId = Config.get('auth.client.id');
  if (!client && clientId) {
    client = { id: clientId, secret: Config.get('auth.client.secret') || undefined, assertionPath: Config.get('auth.client.assertion-path') || undefined };
  }

  return { ...options, issuer, audience, client };
}
