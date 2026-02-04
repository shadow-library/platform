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
    'server.env': 'dev' | 'staging' | 'prod';

    /** Database configs */
    'db.primary.url': string;
    'db.primary.max-connections'?: number;
  }
}

/**
 * Configs
 */
Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });
Config.load('server.env', { defaultValue: 'dev', allowedValues: ['dev', 'staging', 'prod'], isProdRequired: true });

Config.load('db.primary.url', { defaultValue: 'postgresql://admin:password@localhost/shadow_pulse' });
Config.load('db.primary.max-connections', { validateType: 'number' });
