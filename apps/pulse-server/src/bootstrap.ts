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

    /** Externally visible origin of this service; the OIDC relying-party callback URL is derived from it */
    'app.public-url': string;

    /** OIDC relying-party (`pulse` WEB_CONFIDENTIAL) client credentials — distinct from the SDK's `auth.client.*` service client */
    'app.client.id': string;
    'app.client.secret': string;

    /**
     * Pulse-specific auth configs. The shared `@shadow-library/auth` SDK declares and loads the
     * `auth.issuer`/`auth.audience`/`auth.client.*` keys itself; pulse only adds the audience of
     * the SDK's own service token towards identity. Dev fallbacks and prod fail-fast checks for
     * the SDK keys live in `src/modules/auth/auth.module.ts`.
     */
    'auth.identity-resource': string;
  }
}

/**
 * Configs
 */
Config.load('app.stage', { defaultValue: 'dev', allowedValues: ['dev', 'staging', 'prod'], isProdRequired: true });
Config.load('app.public-url', { isProdRequired: true });
Config.load('app.client.id');
Config.load('app.client.secret');
Config.load('auth.identity-resource', { defaultValue: 'shadow-identity' });
