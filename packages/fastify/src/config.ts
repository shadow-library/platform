import { Config, Logger } from '@shadow-library/common';

import { NAMESPACE } from './constants';

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

const isDevValue = String(Config.isDev());
const logger = Logger.getLogger(NAMESPACE, 'Config');

// `true` trusts the spoofable client-supplied x-forwarded-for; a numeric hop count is spoofable too (CVE-2026-16732),
// so fastify >= 5.12.1 treats it as trust-nothing and it maps to `false`. Only a CIDR list is safe.
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
  logger.warn('APP_TRUST_PROXY=true trusts every proxy hop and lets a client spoof request.ip; prefer a trusted CIDR list');
}

Config.load('app.dev.delay', { validateType: 'integer' });
Config.load('app.dev.stack-trace', { defaultValue: isDevValue, validateType: 'boolean' });
