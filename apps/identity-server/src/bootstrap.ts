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

    /** Database configs */
    'db.primary.url': string;
  }
}

/**
 * Configs
 */
Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });
Config.load('db.primary.url', { envKey: 'PRIMARY_DATABASE_URL', defaultValue: 'postgresql://admin:password@localhost/shadow_identity' });
