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
    'app.port': number;
    'app.host': string;

    'app.dev.delay': number;
    'app.dev.stack-trace': boolean;
  }
}

/**
 * Declaring the constants
 */
const isDevValue = String(Config.isDev());

Config.load('app.host', { defaultValue: 'localhost' });
Config.load('app.port', { defaultValue: '8080', validateType: 'integer' });

Config.load('app.dev.delay', { validateType: 'integer' });
Config.load('app.dev.stack-trace', { defaultValue: isDevValue, validateType: 'boolean' });
