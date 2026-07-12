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
    'auth.bootstrap.admin-email': string;
    'auth.bootstrap.admin-password': string;
    'auth.password.breach-check-enabled': boolean;
    'auth.webauthn.rp-id': string;
    'auth.webauthn.origin': string;

    /** Security configs */
    'security.master-encryption-key': string;
    'rate-limit.enabled': boolean;
    'rate-limit.ip-allowlist': string;
    'webhooks.allow-insecure-targets': boolean;

    /** Notification service (pulse-server) */
    'notification.base-url': string;
    'notification.service-name': string;

    /** Worker configs */
    'worker.poll-interval': number;

    /** OAuth / OIDC */
    'oauth.issuer': string;
    'oauth.login-url': string;

    /** Web UI */
    'ui.public-dir': string;
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
Config.load('auth.bootstrap.admin-email', { defaultValue: 'admin@shadow-apps.com' });
Config.load('auth.bootstrap.admin-password', { defaultValue: 'Password@123' });
Config.load('auth.password.breach-check-enabled', { defaultValue: 'false', validateType: 'boolean' });
Config.load('auth.webauthn.rp-id', { defaultValue: 'localhost' });
Config.load('auth.webauthn.origin', { defaultValue: 'http://localhost:8080' });

Config.load('notification.base-url', { defaultValue: 'http://localhost:3000/api/v1' });
Config.load('notification.service-name', { defaultValue: 'shadow-identity' });

Config.load('worker.poll-interval', { defaultValue: '5000', validateType: 'number' });

Config.load('oauth.issuer', { defaultValue: 'https://identity.shadow-apps.com' });
Config.load('oauth.login-url', { defaultValue: 'https://identity.shadow-apps.com/login' });

Config.load('rate-limit.enabled', { defaultValue: 'true', validateType: 'boolean' });
Config.load('rate-limit.ip-allowlist', { defaultValue: '' });

/** Relaxes the webhook SSRF guard (https-only, public addresses) for local development and tests. */
Config.load('webhooks.allow-insecure-targets', { defaultValue: 'false', validateType: 'boolean' });

Config.load('ui.public-dir', { defaultValue: `${process.cwd()}/public` });

/**
 * The master encryption key wraps signing/encryption keys at rest. It must never fall back to a
 * default in production: a predictable key-encryption key defeats envelope encryption entirely.
 */
Config.load('security.master-encryption-key', {
  isProdRequired: true,
  defaultValue: 'dev-only-insecure-master-encryption-key-do-not-use-in-production',
});
