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

    /** Non-public novel access */
    'access.membership-ttl': number;
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

/**
 * How long an organisation-membership answer from identity is trusted, in seconds. This is the
 * upper bound on how long a removed member keeps reading an `ORGANISATION` novel, so shortening it
 * trades identity round trips for revocation latency. Per-user grants are unaffected — those are
 * read from Postgres on every request and revoke immediately.
 */
Config.load('access.membership-ttl', { defaultValue: '60', validateType: 'number' });

/**
 * Where this service's content-addressed images (novel covers, wiki entries) are publicly served from.
 * Rows store only a storage ref (e.g. `<sha256>.webp`); the read surface resolves each to an absolute URL
 * under this origin, so the store's location can move without rewriting a single row. A trailing slash is
 * tolerated — the resolver strips it. The key itself is typed by `@shadow-library/modules`'s storage
 * `ConfigRecords` augmentation (declared optional there); this app loads its own default rather than
 * depending on that package's `StorageModule`, so it must not redeclare the key here too.
 */
Config.load('storage.public-origin', { defaultValue: 'http://localhost:9000/wiki-assets' });
