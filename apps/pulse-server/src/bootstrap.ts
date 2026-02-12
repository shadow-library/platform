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
    'server.env': 'dev' | 'staging' | 'prod';
  }
}

/**
 * Configs
 */
Config.load('server.env', { defaultValue: 'dev', allowedValues: ['dev', 'staging', 'prod'], isProdRequired: true });
