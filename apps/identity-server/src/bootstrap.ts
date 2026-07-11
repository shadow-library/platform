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

    /** Auth configs */
    'auth.flow.ttl': number;
  }
}

/**
 * Configs
 *
 * Datastore connection configs (postgres/redis) are owned and validated by
 * `@shadow-library/modules` DatabaseModule; they are production-required there.
 */
Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

Config.load('auth.flow.ttl', { defaultValue: '900', validateType: 'number' });
