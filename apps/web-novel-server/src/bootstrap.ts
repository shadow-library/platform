import { Config } from '@shadow-library/common';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;
    'catalog.cache-max-age': number;
    'access.membership-ttl': number;
  }
}

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

Config.load('catalog.cache-max-age', { defaultValue: '300', validateType: 'number' });

/**
 * How long an organisation-membership answer from identity is trusted, in seconds. This is the
 * upper bound on how long a removed member keeps reading an `ORGANISATION` novel, so shortening it
 * trades identity round trips for revocation latency. Per-user grants are unaffected — those are
 * read from Postgres on every request and revoke immediately.
 */
Config.load('access.membership-ttl', { defaultValue: '60', validateType: 'number' });

/**
 * This app loads `storage.public-origin` without `StorageModule`; its type comes from the storage
 * package's ConfigRecords augmentation and must not be redeclared here.
 */
Config.load('storage.public-origin', { defaultValue: 'http://localhost:9000/wiki-assets' });
