import { type Application } from '@server/modules/infrastructure/datastore';

interface SeedScope {
  name: string;
  description: string;
  /** Surfaced separately from the plain scope list and gated at consent/elevation. */
  isSensitive?: boolean;
  /** `SERVICE` never reaches a user token, `USER` never a service token. Defaults to `BOTH`. */
  principalType?: 'USER' | 'SERVICE' | 'BOTH';
}

interface SeedPermission {
  name: string;
  description: string;
}

interface SeedRole {
  name: string;
  description: string;
  permissions: readonly string[];
  /** Assigns this role to the bootstrap administrator in the platform organisation at creation. */
  grantToBootstrapAdmin?: boolean;
}

export interface SeedScopeGrant {
  /** Owning resource identifier: `api://<app>`, or `shadow-identity` for the platform API. */
  resource: string;
  scope: string;
}

interface SeedServiceAccessRule {
  callerClientId: string;
  method: string;
  pathPattern: string;
}

export interface SeedApplication {
  name: string;
  displayName: string;
  description: string;
  resourceName: string;
  /** DNS label the application is actually deployed under, when it differs from `name`; drives the subdomain, public origins and relying-party redirect URIs. */
  publicHost?: string;
  /** Initial release visibility, applied only when the application is created. */
  visibility?: Application.Visibility;
  logo?: boolean;
  scopes?: readonly SeedScope[];
  permissions?: readonly SeedPermission[];
  roles?: readonly SeedRole[];
  /** The application pushes its own role catalogue as the complete truth, so the seed provisions `permissions` and `roles` only at creation. */
  pushesCatalogue?: boolean;
  grants?: readonly SeedScopeGrant[];
  serviceAccess?: readonly SeedServiceAccessRule[];
}

export interface SeedServiceClient {
  /** Fixed rather than generated: consumers look the client up by this exact id. */
  id: string;
  label: string;
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
const PULSE_ADMIN_PERMISSIONS = [...PULSE_OPERATOR_PERMISSIONS, 'pulse:senders:write', 'pulse:messages:read', 'pulse:notifications:send'] as const;

/** Mirrors `apps/synapse-server/src/modules/auth/rbac.constants.ts`. */
const SYNAPSE_VIEWER_PERMISSIONS = ['synapse:catalog:read', 'synapse:usage:read'] as const;
const SYNAPSE_OPERATOR_PERMISSIONS = [...SYNAPSE_VIEWER_PERMISSIONS, 'synapse:catalog:write'] as const;
const SYNAPSE_FINANCE_PERMISSIONS = [...SYNAPSE_VIEWER_PERMISSIONS, 'synapse:budgets:write'] as const;
const SYNAPSE_ADMIN_PERMISSIONS = [...SYNAPSE_OPERATOR_PERMISSIONS, 'synapse:catalog:publish', 'synapse:providers:write', 'synapse:budgets:write'] as const;
const SYNAPSE_CREDENTIALS_ADMIN_PERMISSIONS = ['synapse:credentials:manage'] as const;

const SYNAPSE_INFER = { resource: 'api://synapse', scope: 'synapse:infer' } as const;
const SYNAPSE_CATALOG_READ = { resource: 'api://synapse', scope: 'synapse:catalog:read' } as const;

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
        { name: 'pulse:messages:read', description: 'Read the dev message log, including recipient PII and rendered message bodies' },
        { name: 'pulse:notifications:send', description: 'Send a notification manually from the pulse console' },
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
      name: 'synapse',
      displayName: 'Synapse',
      description: 'Platform AI service: model catalog, routing and metering for Shadow apps',
      resourceName: 'Synapse AI API',
      visibility: 'INTERNAL',
      scopes: [
        { name: 'synapse:infer', description: 'Call Synapse inference endpoints', principalType: 'SERVICE' },
        { name: 'synapse:catalog:read', description: 'Read the Synapse model catalog for a calling app', principalType: 'SERVICE' },
      ],
      permissions: [
        { name: 'synapse:catalog:read', description: 'Read the model catalog, its drafts and version history' },
        { name: 'synapse:catalog:write', description: 'Create and edit model catalog drafts' },
        { name: 'synapse:catalog:publish', description: 'Publish and roll back model catalog versions' },
        { name: 'synapse:providers:write', description: 'Manage inference providers and their endpoints' },
        { name: 'synapse:budgets:write', description: 'Manage per-app and per-subject usage budgets' },
        { name: 'synapse:usage:read', description: 'Read usage, cost and ledger reports' },
        { name: 'synapse:credentials:manage', description: 'Create, rotate and revoke provider API credentials' },
      ],
      roles: [
        { name: 'SynapseViewer', description: 'Read-only access to the synapse catalog and usage', permissions: SYNAPSE_VIEWER_PERMISSIONS },
        { name: 'SynapseOperator', description: 'Day-to-day operator: reads everything and edits catalog drafts', permissions: SYNAPSE_OPERATOR_PERMISSIONS },
        { name: 'SynapseFinance', description: 'Reads usage and the catalog, and sets budgets', permissions: SYNAPSE_FINANCE_PERMISSIONS },
        { name: 'SynapseAdmin', description: 'Full control over the synapse catalog, providers and budgets', permissions: SYNAPSE_ADMIN_PERMISSIONS, grantToBootstrapAdmin: true },
        {
          name: 'SynapseCredentialsAdmin',
          description: 'Manage provider API credentials, separate from catalog editing',
          permissions: SYNAPSE_CREDENTIALS_ADMIN_PERMISSIONS,
          grantToBootstrapAdmin: true,
        },
      ],
      grants: [AUTHZ_CHECK, APP_SESSION],
      serviceAccess: [
        { callerClientId: 'novel-forge', method: 'POST', pathPattern: '/api/v1/chat/completions' },
        { callerClientId: 'novel-forge', method: 'POST', pathPattern: '/api/v1/embeddings' },
        { callerClientId: 'novel-forge', method: 'POST', pathPattern: '/api/v1/images/generations' },
        { callerClientId: 'novel-forge', method: 'GET', pathPattern: '/api/v1/catalog' },
        { callerClientId: 'memoir', method: 'POST', pathPattern: '/api/v1/chat/completions' },
        { callerClientId: 'memoir', method: 'POST', pathPattern: '/api/v1/embeddings' },
        { callerClientId: 'memoir', method: 'POST', pathPattern: '/api/v1/images/generations' },
        { callerClientId: 'memoir', method: 'GET', pathPattern: '/api/v1/catalog' },
      ],
    },
    {
      name: 'novel-forge',
      displayName: 'Novel Forge',
      description: 'Long-form fiction authoring platform for the Shadow ecosystem',
      resourceName: 'Novel Forge API',
      publicHost: 'novelforge',
      pushesCatalogue: true,
      scopes: [
        {
          name: 'novel-forge:bots:manage',
          description: 'Read and reassign what an organisation bot owns in novel forge',
          principalType: 'SERVICE',
        },
      ],
      permissions: [
        { name: 'novel-forge:curate', description: "Reach an organisation's shared projects and set authorship attribution on a publish" },
        { name: 'novel-forge:admin', description: 'Inspect workflow runs: prompt anatomy, context packs, per-call latency and raw model output' },
      ],
      roles: [
        {
          name: 'NovelForgeCurator',
          description: "Organisation member who works on the organisation's shared projects",
          permissions: ['novel-forge:curate'],
          grantToBootstrapAdmin: true,
        },
        {
          name: 'NovelForgeAdmin',
          description: 'Platform operator who inspects workflow runs, their prompts and raw model output',
          permissions: ['novel-forge:admin'],
          grantToBootstrapAdmin: true,
        },
      ],
      grants: [AUTHZ_CHECK, AUTHZ_ROLES_SYNC, APP_SESSION, USERS_RESOLVE, { resource: 'api://web-novel', scope: 'web-novel:publish' }, SYNAPSE_INFER, SYNAPSE_CATALOG_READ],
      serviceAccess: [{ callerClientId: 'identity-server', method: '*', pathPattern: '/internal/bots/*' }],
    },
    {
      name: 'web-novel',
      displayName: 'Web Novel',
      description: 'Reader-facing web novel catalogue for the Shadow ecosystem',
      resourceName: 'Web Novel Reader API',
      publicHost: 'webnovel',
      visibility: 'INTERNAL',
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
      grants: [AUTHZ_CHECK, APP_SESSION, USERS_RESOLVE, { resource: 'api://pulse', scope: 'notifications:send' }, SYNAPSE_INFER, SYNAPSE_CATALOG_READ],
    },
  ],
  serviceClients: [
    {
      /** The lookup in NotificationTokenService matches on this exact name, so it must stay `identity-server`. */
      id: 'identity-server',
      label: 'identity outbound',
      application: PLATFORM_APPLICATION,
      grants: [
        { resource: 'api://pulse', scope: 'notifications:send' },
        { resource: 'api://novel-forge', scope: 'novel-forge:bots:manage' },
      ],
    },
  ],
};
