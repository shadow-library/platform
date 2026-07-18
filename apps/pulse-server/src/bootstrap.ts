/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    /** App configs */
    'app.stage': 'dev' | 'staging' | 'prod';

    /** Auth configs — pulse is an OAuth2 resource server against the shadow identity platform */
    'auth.issuer': string;
    'auth.audience': string;
    'auth.client-id': string;
    'auth.client-secret': string;
    'auth.identity-resource': string;
  }
}

/**
 * Configs
 */
Config.load('app.stage', { defaultValue: 'dev', allowedValues: ['dev', 'staging', 'prod'], isProdRequired: true });

/**
 * The issuer is the trust anchor for every incoming token — a wrong value in production means
 * honouring tokens from the wrong authority — so it must never silently fall back to a default.
 * The audience is this service's resource identifier; tokens whose `aud` omits it are rejected.
 */
Config.load('auth.issuer', { isProdRequired: true, defaultValue: 'http://localhost:8080' });
Config.load('auth.audience', { defaultValue: 'shadow-pulse' });

/**
 * The service-account credentials authenticate pulse's own machine-to-machine calls to the identity
 * PDP (`/authz/check`); without them every permission check fails closed and operators are locked out.
 */
Config.load('auth.client-id', { isProdRequired: true, defaultValue: 'pulse' });
Config.load('auth.client-secret', { isProdRequired: true, defaultValue: 'dev-only-insecure-pulse-client-secret' });
Config.load('auth.identity-resource', { defaultValue: 'shadow-identity' });
