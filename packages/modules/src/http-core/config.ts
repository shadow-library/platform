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
    'http-core.csrf.enabled': boolean;
    'http-core.helmet.enabled'?: boolean;
    'http-core.compress.enabled'?: boolean;
    'http-core.openapi.enabled'?: boolean;

    /*! Health Service configs */
    'health.host': string;
    'health.port': number;
    'health.enabled': boolean;
  }
}

/**
 * Declaring the constants
 */
Config.load('http-core.csrf.enabled', { validateType: 'boolean', defaultValue: 'true' });
Config.load('http-core.helmet.enabled', { validateType: 'boolean' });
Config.load('http-core.compress.enabled', { validateType: 'boolean' });
Config.load('http-core.openapi.enabled', { validateType: 'boolean' });

Config.load('health.host', { defaultValue: 'localhost' });
Config.load('health.port', { validateType: 'number', defaultValue: '8081' });
Config.load('health.enabled', { validateType: 'boolean', defaultValue: Config.isProd() ? 'true' : 'false' });
