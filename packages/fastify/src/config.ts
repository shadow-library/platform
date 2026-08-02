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
    'app.trust-proxy': boolean;

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
// Off by default: a process reachable outside the cluster must never derive request.ip from a
// client-supplied x-forwarded-for header. Operators behind the ingress set APP_TRUST_PROXY=true.
Config.load('app.trust-proxy', { defaultValue: 'false', validateType: 'boolean' });

Config.load('app.dev.delay', { validateType: 'integer' });
Config.load('app.dev.stack-trace', { defaultValue: isDevValue, validateType: 'boolean' });
