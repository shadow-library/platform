/**
 * Importing packages with side effects
 */

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
    /** Server configs */
    'server.port': number;
    'server.host': string;

    /** Public chapter delivery */
    'catalog.cache-max-age': number;
  }
}

/**
 * Configs
 *
 * Datastore connection configs (postgres) are owned and validated by the
 * `@shadow-library/modules` DatabaseModule; they are production-required there.
 */
Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

/**
 * The first-party reader login flow is owned end to end by `@shadow-library/auth`: it loads its own
 * `auth.*` keys (`AUTH_ISSUER`, `AUTH_APP_ID`, the credential, and the session-cookie tuning) and
 * derives audience, redirect URIs and scopes from the app registration, so nothing about it is
 * declared here.
 */

/** Public chapter responses advertise this max-age; ETag revalidation covers the rest */
Config.load('catalog.cache-max-age', { defaultValue: '300', validateType: 'number' });
