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
    'auth.workload.sa-token-path': string;
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
 * The kube-apiserver gates its OIDC discovery/JWKS endpoints behind the
 * `system:service-account-issuer-discovery` role, granted to authenticated service accounts but not
 * to anonymous callers. Identity presents its own projected SA token (mounted at this path) when
 * fetching them, so discovery works under default cluster RBAC without exposing the JWKS anonymously.
 * An empty path (non-Kubernetes environments) falls back to an unauthenticated fetch.
 */
Config.load('auth.workload.sa-token-path', { defaultValue: '/var/run/secrets/kubernetes.io/serviceaccount/token' });

Config.load('rate-limit.enabled', { defaultValue: 'true', validateType: 'boolean' });
Config.load('rate-limit.ip-allowlist', { defaultValue: '' });

/** Relaxes the webhook SSRF guard (https-only, public addresses) for local development and tests. */
Config.load('webhooks.allow-insecure-targets', { defaultValue: 'false', validateType: 'boolean' });

/**
 * The master encryption key wraps signing/encryption keys at rest. It must never fall back to a
 * default in production: a predictable key-encryption key defeats envelope encryption entirely.
 */
Config.load('security.master-encryption-key', {
  isProdRequired: true,
  defaultValue: 'dev-only-insecure-master-encryption-key-do-not-use-in-production',
});
