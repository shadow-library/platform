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

export type TrustProxy = boolean | string[];

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
// A numeric hop count is likewise spoofable — a direct client can supply enough hops (CVE-2026-16732) — so fastify removed it (>= 5.12.1)
// and treats it as trust-nothing; a numeric value is mapped to `false` here to match. A trusted-CIDR list trusts only addresses the ingress
// attached and is the safe form; identity-server keys rate limits and IP blocks on request.ip.
export function parseTrustProxy(value: string): TrustProxy {
  if (value === 'true' || value === 'false') return value === 'true';
  if (/^\d+$/.test(value)) {
    logger.warn('APP_TRUST_PROXY numeric hop-count is no longer supported (CVE-2026-16732) — trusting no proxy; use a trusted CIDR list to resolve request.ip behind an ingress');
    return false;
  }
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
