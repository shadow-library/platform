/**
 * Importing npm packages
 */

import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from './constants';

/**
 * Defining types
 */

export type TrustProxy = boolean | number | string[];

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'app.port': number;
    'app.host': string;
    'app.trust-proxy': TrustProxy;

    'app.dev.delay': number;
    'app.dev.stack-trace': boolean;
  }
}

/**
 * Declaring the constants
 */
const isDevValue = String(Config.isDev());
const logger = Logger.getLogger(NAMESPACE, 'Config');

// Fastify's `trustProxy: true` derives `request.ip` from the client-supplied, left-most x-forwarded-for entry, which is spoofable.
// A hop count or trusted-CIDR list instead trusts only addresses the ingress attached; identity-server keys rate limits and IP blocks on request.ip.
export function parseTrustProxy(value: string): TrustProxy {
  if (value === 'true' || value === 'false') return value === 'true';
  if (/^\d+$/.test(value)) return Number(value);
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

Config.load('app.host', { defaultValue: 'localhost' });
Config.load('app.port', { defaultValue: '8080', validateType: 'integer' });
Config.load('app.trust-proxy', { defaultValue: 'false', transform: parseTrustProxy });
if (Config.get('app.trust-proxy') === true) {
  logger.warn('APP_TRUST_PROXY=true trusts every proxy hop and lets a client spoof request.ip; prefer a hop count or a trusted CIDR list');
}

Config.load('app.dev.delay', { validateType: 'integer' });
Config.load('app.dev.stack-trace', { defaultValue: isDevValue, validateType: 'boolean' });
