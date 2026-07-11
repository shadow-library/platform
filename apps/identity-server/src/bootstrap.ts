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
Config.load('auth.bootstrap.admin-email', { envKey: 'IDENTITY_BOOTSTRAP_ADMIN_EMAIL', defaultValue: 'admin@shadow-apps.com' });
Config.load('auth.bootstrap.admin-password', { envKey: 'IDENTITY_BOOTSTRAP_ADMIN_PASSWORD', defaultValue: '' });
Config.load('auth.password.breach-check-enabled', { envKey: 'AUTH_PASSWORD_BREACH_CHECK', defaultValue: 'false', validateType: 'boolean' });
Config.load('auth.webauthn.rp-id', { envKey: 'AUTH_WEBAUTHN_RP_ID', defaultValue: 'localhost' });
Config.load('auth.webauthn.origin', { envKey: 'AUTH_WEBAUTHN_ORIGIN', defaultValue: 'http://localhost:8080' });

Config.load('notification.base-url', { envKey: 'NOTIFICATION_BASE_URL', defaultValue: 'http://localhost:3000/api/v1' });
Config.load('notification.service-name', { envKey: 'NOTIFICATION_SERVICE_NAME', defaultValue: 'shadow-identity' });

Config.load('worker.poll-interval', { envKey: 'WORKER_POLL_INTERVAL', defaultValue: '5000', validateType: 'number' });

Config.load('oauth.issuer', { envKey: 'OAUTH_ISSUER', defaultValue: 'https://identity.shadow-apps.com' });
Config.load('oauth.login-url', { envKey: 'OAUTH_LOGIN_URL', defaultValue: 'https://identity.shadow-apps.com/login' });

Config.load('rate-limit.enabled', { envKey: 'RATE_LIMIT_ENABLED', defaultValue: 'true', validateType: 'boolean' });
Config.load('rate-limit.ip-allowlist', { envKey: 'RATE_LIMIT_IP_ALLOWLIST', defaultValue: '' });

/** Relaxes the webhook SSRF guard (https-only, public addresses) for local development and tests. */
Config.load('webhooks.allow-insecure-targets', { envKey: 'WEBHOOKS_ALLOW_INSECURE_TARGETS', defaultValue: 'false', validateType: 'boolean' });

Config.load('ui.public-dir', { envKey: 'UI_PUBLIC_DIR', defaultValue: `${process.cwd()}/public` });

/**
 * The master encryption key wraps signing/encryption keys at rest. It must never fall back to a
 * default in production: a predictable key-encryption key defeats envelope encryption entirely.
 */
Config.load('security.master-encryption-key', {
  envKey: 'MASTER_ENCRYPTION_KEY',
  isProdRequired: true,
  defaultValue: 'dev-only-insecure-master-encryption-key-do-not-use-in-production',
});
