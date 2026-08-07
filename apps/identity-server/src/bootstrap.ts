import { Config } from '@shadow-library/common';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'server.port': number;
    'server.host': string;

    'auth.flow.ttl': number;
    'auth.bootstrap.admin-email': string;
    'auth.bootstrap.admin-password': string;
    'auth.password.breach-check-enabled': boolean;
    'auth.webauthn.rp-id': string;
    'auth.webauthn.origin': string;

    /** Key-encryption key used to wrap signing and encryption keys at rest; no default is permitted in production. */
    'security.master-encryption-key': string;
    'rate-limit.enabled': boolean;
    /** Comma-separated client IPs exempt from rate limiting. */
    'rate-limit.ip-allowlist': string;
    /** Relaxes the HTTPS/public-address webhook target guard for local development and tests. */
    'webhooks.allow-insecure-targets': boolean;

    /** Audience placed in outbound service tokens; must mirror Pulse's `AUTH_AUDIENCE`. */
    'notification.audience': string;

    'worker.poll-interval': number;

    'oauth.issuer': string;
    'oauth.login-url': string;

    /** Trusted Kubernetes service-account token issuer; an empty value disables workload identity. Assertions use `oauth.issuer` as their audience. */
    'auth.workload.issuer': string;
    /** Optional JWKS override; otherwise resolved from the workload issuer's discovery document. */
    'auth.workload.jwks-uri': string;
    /** Projected token used to authenticate issuer discovery/JWKS requests; an empty path uses unauthenticated requests. */
    'auth.workload.sa-token-path': string;
  }
}

Config.load('server.port', { defaultValue: '8080', validateType: 'number' });
Config.load('server.host', { defaultValue: '0.0.0.0' });

Config.load('auth.flow.ttl', { defaultValue: '900', validateType: 'number' });
Config.load('auth.bootstrap.admin-email', { defaultValue: 'admin@shadow-apps.com' });
Config.load('auth.bootstrap.admin-password', { defaultValue: 'Password@123' });
Config.load('auth.password.breach-check-enabled', { defaultValue: 'false', validateType: 'boolean' });
Config.load('auth.webauthn.rp-id', { defaultValue: 'localhost' });
Config.load('auth.webauthn.origin', { defaultValue: 'http://localhost:8080' });

Config.load('notification.audience', { defaultValue: 'api://pulse' });

Config.load('worker.poll-interval', { defaultValue: '5000', validateType: 'number' });

Config.load('oauth.issuer', { defaultValue: 'https://identity.shadow-apps.com' });
Config.load('oauth.login-url', { defaultValue: 'https://identity.shadow-apps.com/login' });

/** The assertion audience is pinned to `oauth.issuer`; workloads must project a dedicated service-account token. */
Config.load('auth.workload.issuer', { defaultValue: '' });
Config.load('auth.workload.jwks-uri', { defaultValue: '' });
Config.load('auth.workload.sa-token-path', { defaultValue: '/var/run/secrets/kubernetes.io/serviceaccount/token' });

Config.load('rate-limit.enabled', { defaultValue: 'true', validateType: 'boolean' });
Config.load('rate-limit.ip-allowlist', { defaultValue: '' });

Config.load('webhooks.allow-insecure-targets', { defaultValue: 'false', validateType: 'boolean' });

Config.load('security.master-encryption-key', {
  isProdRequired: true,
  defaultValue: 'dev-only-insecure-master-encryption-key-do-not-use-in-production',
});
