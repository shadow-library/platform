import { type Application } from '@server/modules/infrastructure/datastore';

/** A scope exposed by an application's own API resource. */
export interface SeedScope {
  name: string;
  description: string;
  /** Surfaced separately from the plain scope list and gated at consent/elevation. */
  isSensitive?: boolean;
  /** `SERVICE` never reaches a user token, `USER` never a service token. Defaults to `BOTH`. */
  principalType?: 'USER' | 'SERVICE' | 'BOTH';
}

/** An entry in an application's RBAC catalogue, granted to roles by name. */
export interface SeedPermission {
  name: string;
  description: string;
}

export interface SeedRole {
  name: string;
  description: string;
  /** Permission names from the same application's catalogue. */
  permissions: readonly string[];
  /** Assigns this role to the bootstrap administrator in the platform organisation at creation. */
  grantToBootstrapAdmin?: boolean;
}

/** A grant to a scope already exposed by another application's API resource. */
export interface SeedScopeGrant {
  /** Owning resource identifier: `api://<app>`, or `shadow-identity` for the platform API. */
  resource: string;
  scope: string;
}

/** A caller allow-listed onto an application's otherwise deny-by-default routes. */
export interface SeedServiceAccessRule {
  callerClientId: string;
  method: string;
  pathPattern: string;
}

/** One first-party application and the API resource, client, catalogue and grants derived for it. */
export interface SeedApplication {
  name: string;
  displayName: string;
  description: string;
  /** Display name of the `api://<name>` API resource. */
  resourceName: string;
  /** DNS label the application is actually deployed under, when it differs from `name`; drives the subdomain, public origins and relying-party redirect URIs. */
  publicHost?: string;
  /** Initial release visibility, applied only when the application is created. */
  visibility?: Application.Visibility;
  /** Whether the application's primary origin exposes the conventional logo asset. */
  logo?: boolean;
  scopes?: readonly SeedScope[];
  permissions?: readonly SeedPermission[];
  roles?: readonly SeedRole[];
  grants?: readonly SeedScopeGrant[];
  serviceAccess?: readonly SeedServiceAccessRule[];
}

/** An M2M client owned by an application but distinct from that application's own client. */
export interface SeedServiceClient {
  /** Fixed rather than generated: consumers look the client up by this exact id. */
  id: string;
  /** Human label used in the first-boot credential log line. */
  label: string;
  /** Name of the owning application, which must already exist when seeding runs. */
  application: string;
  grants?: readonly SeedScopeGrant[];
}

export interface EcosystemSeed {
  applications: readonly SeedApplication[];
  serviceClients: readonly SeedServiceClient[];
}

const PLATFORM_RESOURCE = 'shadow-identity';
const PLATFORM_APPLICATION = 'shadow-identity';

const AUTHZ_CHECK = { resource: PLATFORM_RESOURCE, scope: 'authz:check' } as const;
const APP_SESSION = { resource: PLATFORM_RESOURCE, scope: 'app-session:manage' } as const;
const AUTHZ_ROLES_SYNC = { resource: PLATFORM_RESOURCE, scope: 'authz:roles:sync' } as const;
const USERS_RESOLVE = { resource: PLATFORM_RESOURCE, scope: 'users:resolve' } as const;

/**
 * The pulse RBAC catalogue, kept in lockstep with `pulse-server/src/modules/auth/rbac.constants.ts`.
 * SDK role-sync is intentionally off on pulse, so the two lists must be edited together.
 */
const PULSE_VIEWER_PERMISSIONS = ['pulse:templates:read', 'pulse:senders:read', 'pulse:metrics:read', 'pulse:logs:read'] as const;
const PULSE_OPERATOR_PERMISSIONS = [...PULSE_VIEWER_PERMISSIONS, 'pulse:templates:write', 'pulse:templates:publish', 'pulse:layouts:write'] as const;
const PULSE_ADMIN_PERMISSIONS = [...PULSE_OPERATOR_PERMISSIONS, 'pulse:senders:write'] as const;

/**
 * The first-party ecosystem reconciled on boot. Each application gets one client whose id equals
 * its name and one `api://<name>` resource; existing records are never overwritten.
 */
export const ECOSYSTEM_SEED: EcosystemSeed = {
  applications: [
    {
      name: 'pulse',
      displayName: 'Pulse',
      description: 'Centralised multi-channel notification platform for the Shadow ecosystem',
      resourceName: 'Pulse notification API',
      logo: true,
      visibility: 'INTERNAL',
      scopes: [
        {
          name: 'notifications:send',
          description: 'Send notifications through pulse',
          principalType: 'SERVICE',
        },
      ],
      permissions: [
        { name: 'pulse:templates:read', description: 'Read notification templates' },
        { name: 'pulse:templates:write', description: 'Create and edit notification template drafts' },
        { name: 'pulse:templates:publish', description: 'Publish and roll back notification template versions' },
        { name: 'pulse:layouts:write', description: 'Manage the shared design system (email layouts and partials)' },
        { name: 'pulse:senders:read', description: 'Read sender profiles, endpoints and routing rules' },
        { name: 'pulse:senders:write', description: 'Manage sender profiles, endpoints and routing rules' },
        { name: 'pulse:metrics:read', description: 'Read delivery metrics and dashboards' },
        { name: 'pulse:logs:read', description: 'Read notification delivery logs' },
      ],
      roles: [
        { name: 'PulseViewer', description: 'Read-only access to pulse templates, senders, metrics and logs', permissions: PULSE_VIEWER_PERMISSIONS },
        { name: 'PulseOperator', description: 'Day-to-day operator: reads everything and authors templates', permissions: PULSE_OPERATOR_PERMISSIONS },
        { name: 'PulseAdmin', description: 'Full control over pulse templates, senders and configuration', permissions: PULSE_ADMIN_PERMISSIONS, grantToBootstrapAdmin: true },
      ],
      grants: [AUTHZ_CHECK, AUTHZ_ROLES_SYNC, APP_SESSION],
      serviceAccess: [
        { callerClientId: 'identity-server', method: 'POST', pathPattern: '/api/v1/notifications' },
        { callerClientId: 'memoir', method: 'POST', pathPattern: '/api/v1/notifications' },
      ],
    },
    {
      name: 'novel-forge',
      displayName: 'Novel Forge',
      description: 'Long-form fiction authoring platform for the Shadow ecosystem',
      resourceName: 'Novel Forge API',
      publicHost: 'novelforge',
      permissions: [{ name: 'novel-forge:curate', description: 'Publish third-party novels under their original author and manage curated-ingest API keys' }],
      roles: [
        {
          name: 'NovelForgeCurator',
          description: 'Internal platform admin who brings third-party novels into the platform',
          permissions: ['novel-forge:curate'],
          grantToBootstrapAdmin: true,
        },
      ],
      grants: [AUTHZ_CHECK, APP_SESSION, USERS_RESOLVE, { resource: 'api://web-novel', scope: 'web-novel:publish' }],
    },
    {
      name: 'web-novel',
      displayName: 'Web Novel',
      description: 'Reader-facing web novel catalogue for the Shadow ecosystem',
      resourceName: 'Web Novel Reader API',
      publicHost: 'webnovel',
      scopes: [
        {
          name: 'web-novel:publish',
          description: 'Publish rendered novels to the reader',
          principalType: 'SERVICE',
        },
      ],
      grants: [AUTHZ_CHECK, APP_SESSION, USERS_RESOLVE],
      serviceAccess: [{ callerClientId: 'novel-forge', method: '*', pathPattern: '/internal/*' }],
    },
    {
      name: 'memoir',
      displayName: 'Memoir',
      description: 'Personal finance and life-progression companion for the Shadow ecosystem',
      resourceName: 'Memoir API',
      publicHost: 'memoir',
      scopes: [
        { name: 'memoir:sync', description: 'Read and write client sync state and commands', principalType: 'USER' },
        { name: 'memoir:account', description: 'Manage profile, settings, consents and data export', principalType: 'USER' },
        { name: 'memoir:destructive', description: 'Delete the account and its data', isSensitive: true, principalType: 'USER' },
      ],
      grants: [AUTHZ_CHECK, APP_SESSION, USERS_RESOLVE, { resource: 'api://pulse', scope: 'notifications:send' }],
    },
  ],
  serviceClients: [
    {
      /** The lookup in NotificationTokenService matches on this exact name, so it must stay `identity-server`. */
      id: 'identity-server',
      label: 'identity outbound',
      application: PLATFORM_APPLICATION,
      grants: [{ resource: 'api://pulse', scope: 'notifications:send' }],
    },
  ],
};
