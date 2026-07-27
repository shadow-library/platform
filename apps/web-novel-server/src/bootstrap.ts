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

    /**
     * Reader session configs. The OIDC issuer/audience keys (`AUTH_ISSUER`/`AUTH_AUDIENCE`) are
     * owned and loaded by `@shadow-library/auth` (`auth.issuer`/`auth.audience`); re-loading them
     * here would double-register the keys, so this app only declares its own session surface.
     */
    'session.client-id': string;
    'session.client-secret': string;
    'session.redirect-uri': string;
    'session.secret': string;
    'session.ttl': number;

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

/** OAuth client identity-side registration for the reader web app's login flow */
Config.load('session.client-id', { defaultValue: 'webnovel-web' });
Config.load('session.client-secret', { isProdRequired: true, defaultValue: 'dev-only-webnovel-web-secret' });
Config.load('session.redirect-uri', { defaultValue: 'http://localhost:8080/api/auth/callback' });

/**
 * The session secret signs the stateless reader-session cookie. It must never fall back to a
 * default in production: a predictable HMAC key lets anyone mint arbitrary reader sessions.
 */
Config.load('session.secret', { isProdRequired: true, defaultValue: 'dev-only-insecure-webnovel-session-secret-do-not-use-in-production' });
Config.load('session.ttl', { defaultValue: String(30 * 24 * 60 * 60), validateType: 'number' });

/** Public chapter responses advertise this max-age; ETag revalidation covers the rest */
Config.load('catalog.cache-max-age', { defaultValue: '300', validateType: 'number' });
