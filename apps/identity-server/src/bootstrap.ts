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
    'notification.audience': string;

    /** Worker configs */
    'worker.poll-interval': number;

    /** OAuth / OIDC */
    'oauth.issuer': string;
    'oauth.login-url': string;

    /** Kubernetes workload identity (D-16): trusted cluster OIDC issuer for SA-token client assertions */
    'auth.workload.issuer': string;
    'auth.workload.audience': string;
    'auth.workload.jwks-uri': string;

    /** Ecosystem seed: comma-separated public origins per app; each origin gets `<origin>/api/auth/callback` registered as an OAuth redirect URI */
    'ecosystem.pulse.public-urls': string;
    'ecosystem.novel-forge.public-urls': string;
    'ecosystem.webnovel.public-urls': string;

    /** Ecosystem seed: optional fixed client credentials (id must be a UUID); unset keeps the random-per-cluster behaviour */
    'ecosystem.pulse.rp-client-id': string | undefined;
    'ecosystem.pulse.rp-client-secret': string | undefined;
    'ecosystem.pulse.server-client-id': string | undefined;
    'ecosystem.pulse.server-client-secret': string | undefined;
    'ecosystem.novel-forge.rp-client-id': string | undefined;
    'ecosystem.novel-forge.rp-client-secret': string | undefined;
    'ecosystem.novel-forge.server-client-id': string | undefined;
    'ecosystem.novel-forge.server-client-secret': string | undefined;
    'ecosystem.webnovel.rp-client-id': string | undefined;
    'ecosystem.webnovel.rp-client-secret': string | undefined;
    'ecosystem.webnovel.server-client-id': string | undefined;
    'ecosystem.webnovel.server-client-secret': string | undefined;
    'ecosystem.identity-server.client-id': string | undefined;
    'ecosystem.identity-server.client-secret': string | undefined;

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
/** `aud` of the outbound service token; must mirror pulse-server's AUTH_AUDIENCE (the identity-seeded `pulse-server` API resource). */
Config.load('notification.audience', { defaultValue: 'pulse-server' });

Config.load('worker.poll-interval', { defaultValue: '5000', validateType: 'number' });

Config.load('oauth.issuer', { defaultValue: 'https://identity.shadow-apps.com' });
Config.load('oauth.login-url', { defaultValue: 'https://identity.shadow-apps.com/login' });

/**
 * Workload identity is opt-in: with no trusted cluster issuer configured, SA-token client
 * assertions are rejected and clients must present their static secret. The audience defaults to
 * the oauth issuer; the jwks uri is normally resolved via the cluster's OIDC discovery document.
 */
Config.load('auth.workload.issuer', { defaultValue: '' });
Config.load('auth.workload.audience', { defaultValue: '' });
Config.load('auth.workload.jwks-uri', { defaultValue: '' });

/**
 * Public origins of the first-party ecosystem apps, used by the ecosystem seed to register the
 * `{origin}/api/auth/callback` redirect URIs of their relying-party OAuth clients. Redirect URIs
 * converge to these values on every boot, so per-environment overrides are picked up on restart.
 */
Config.load('ecosystem.pulse.public-urls', { defaultValue: 'http://pulse.shadow-apps.test,http://localhost:3000' });
Config.load('ecosystem.novel-forge.public-urls', { defaultValue: 'http://novel-forge.shadow-apps.test,http://localhost:3001' });
Config.load('ecosystem.webnovel.public-urls', { defaultValue: 'http://webnovel.shadow-apps.test,http://localhost:3002' });

/**
 * Optional fixed credentials for the ecosystem-seeded OAuth clients (`ECOSYSTEM_<APP>_RP_CLIENT_ID`
 * and friends), letting a fresh cluster pre-declare its client ids/secrets instead of capturing
 * random ones from the first-boot log. Ids must be UUIDs and bind only when the seed first creates
 * the client; secrets converge on every boot. Unset keeps today's random behaviour.
 */
Config.load('ecosystem.pulse.rp-client-id');
Config.load('ecosystem.pulse.rp-client-secret');
Config.load('ecosystem.pulse.server-client-id');
Config.load('ecosystem.pulse.server-client-secret');
Config.load('ecosystem.novel-forge.rp-client-id');
Config.load('ecosystem.novel-forge.rp-client-secret');
Config.load('ecosystem.novel-forge.server-client-id');
Config.load('ecosystem.novel-forge.server-client-secret');
Config.load('ecosystem.webnovel.rp-client-id');
Config.load('ecosystem.webnovel.rp-client-secret');
Config.load('ecosystem.webnovel.server-client-id');
Config.load('ecosystem.webnovel.server-client-secret');
Config.load('ecosystem.identity-server.client-id');
Config.load('ecosystem.identity-server.client-secret');

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
