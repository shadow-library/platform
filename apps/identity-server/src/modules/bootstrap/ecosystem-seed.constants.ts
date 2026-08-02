/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type Application } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

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
  /**
   * Assigns the role to the bootstrap administrator in the platform organisation at creation. A
   * catalogue nobody holds grants nobody anything, so an application reached only through platform
   * staff needs at least one seeded holder or its console answers every request with a denial.
   */
  grantToBootstrapAdmin?: boolean;
}

/**
 * A scope owned by some other application that this client is granted — the delegation ceiling
 * `GET /api/v1/apps/me` surfaces. `resource` is the owning resource identifier (`api://<app>`, or
 * `shadow-identity` for identity's own platform API), and the scope must already exist: grants
 * resolve against the catalogue, they never create it.
 */
export interface SeedScopeGrant {
  resource: string;
  scope: string;
}

/** A caller allow-listed onto this application's routes, which are otherwise deny-by-default (D-17). */
export interface SeedServiceAccessRule {
  callerClientId: string;
  method: string;
  pathPattern: string;
}

/**
 * One first-party application: its record, its single OAuth client (id == name), its `api://<name>`
 * API resource and everything scoped to it (D-21).
 */
export interface SeedApplication {
  name: string;
  displayName: string;
  description: string;
  /** Display name of the `api://<name>` API resource. */
  resourceName: string;
  /** Defaults to `name`. */
  subDomain?: string;
  /**
   * The release surface a fresh deployment starts on. Applied at creation only: visibility is a
   * platform-admin decision thereafter (`PATCH /api/v1/admin/applications/:id`).
   */
  visibility?: Application.Visibility;
  /** Carries the pulse-style `logo192.png` asset off the application's primary origin. */
  logo?: boolean;
  scopes?: readonly SeedScope[];
  permissions?: readonly SeedPermission[];
  roles?: readonly SeedRole[];
  grants?: readonly SeedScopeGrant[];
  serviceAccess?: readonly SeedServiceAccessRule[];
}

/**
 * A machine-to-machine client that is not an application's own identity — it belongs to an
 * application that some other bootstrap step owns, so only the client itself is seeded here.
 */
export interface SeedServiceClient {
  /** Fixed rather than generated: consumers look the client up by this exact id. */
  id: string;
  /** Human label used only in the first-boot credential log line. */
  label: string;
  /** Name of the owning application, which must already exist when the seed runs. */
  application: string;
  grants?: readonly SeedScopeGrant[];
}

export interface EcosystemSeed {
  applications: readonly SeedApplication[];
  serviceClients: readonly SeedServiceClient[];
}

/**
 * Declaring the constants
 */

/** Identity's own platform API keeps its bare identifier — it is the platform, not an app onboarding onto it. */
const PLATFORM_RESOURCE = 'shadow-identity';
/** The same string, but the application record rather than the API resource it exposes. */
const PLATFORM_APPLICATION = 'shadow-identity';

/** Every app's SDK needs these to load service-access rules, call the PDP and open app sessions. */
const AUTHZ_CHECK = { resource: PLATFORM_RESOURCE, scope: 'authz:check' } as const;
const APP_SESSION = { resource: PLATFORM_RESOURCE, scope: 'app-session:manage' } as const;
/** pulse alone: its RBAC catalogue is seeded identity-side rather than pushed by the SDK. */
const AUTHZ_ROLES_SYNC = { resource: PLATFORM_RESOURCE, scope: 'authz:roles:sync' } as const;

/**
 * The pulse RBAC catalogue, kept in lockstep with `pulse-server/src/modules/auth/rbac.constants.ts`.
 * SDK role-sync is intentionally off on pulse, so the two lists must be edited together.
 */
const PULSE_VIEWER_PERMISSIONS = ['pulse:templates:read', 'pulse:senders:read', 'pulse:metrics:read', 'pulse:logs:read'] as const;
const PULSE_OPERATOR_PERMISSIONS = [...PULSE_VIEWER_PERMISSIONS, 'pulse:templates:write', 'pulse:templates:publish', 'pulse:layouts:write'] as const;
const PULSE_ADMIN_PERMISSIONS = [...PULSE_OPERATOR_PERMISSIONS, 'pulse:senders:write'] as const;

/**
 * The whole first-party ecosystem the identity platform integrates with (D-21), as data. Each
 * application holds **one** client whose id equals the application name and exposes **one** API
 * resource, `api://<name>`, both derived from the name — the former `<app>` / `<app>-server` client
 * pairs are gone, since an id that could mean either of an application's two clients was ambiguous
 * at exactly the moments it mattered.
 *
 * Adding an application here is the whole change: {@link EcosystemSeedService} creates whatever is
 * missing on the next boot and never revisits what already exists.
 */
export const ECOSYSTEM_SEED: EcosystemSeed = {
  applications: [
    {
      name: 'pulse',
      displayName: 'Shadow Pulse',
      description: 'Centralised multi-channel notification platform for the Shadow ecosystem',
      resourceName: 'Pulse notification API',
      logo: true,
      /** Pulse is the ecosystem's own operations console — platform staff only, and invisible to everyone else (D-A3). */
      visibility: 'INTERNAL',
      scopes: [
        {
          name: 'notifications:send',
          description: 'Send notifications through pulse',
          /** A machine-to-machine capability, so it must never leak into a user token. */
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
      /** pulse enforces deny-by-default, so identity's outbound notification call must be allow-listed. */
      serviceAccess: [{ callerClientId: 'identity-server', method: 'POST', pathPattern: '/api/v1/notifications' }],
    },
    {
      name: 'novel-forge',
      displayName: 'Novel Forge',
      description: 'Long-form fiction authoring platform for the Shadow ecosystem',
      resourceName: 'Novel Forge API',
      /** Delegates onto web-novel: the publish grant is the ceiling `/apps/me` surfaces (D-22). */
      grants: [AUTHZ_CHECK, APP_SESSION, { resource: 'api://web-novel', scope: 'web-novel:publish' }],
    },
    {
      name: 'web-novel',
      displayName: 'Web Novel Reader',
      description: 'Reader-facing web novel catalogue for the Shadow ecosystem',
      resourceName: 'Web Novel Reader API',
      scopes: [
        {
          name: 'web-novel:publish',
          description: 'Publish rendered novels to the reader',
          /** Service-only: a user token can never carry it, and only a granted M2M client may request it. */
          principalType: 'SERVICE',
        },
      ],
      grants: [AUTHZ_CHECK, APP_SESSION],
      serviceAccess: [{ callerClientId: 'novel-forge', method: '*', pathPattern: '/internal/*' }],
    },
  ],
  serviceClients: [
    {
      /** The lookup in NotificationTokenService matches on this exact name, so it must stay `identity-server`. */
      id: 'identity-server',
      label: 'identity outbound',
      application: PLATFORM_APPLICATION,
      /** Without this grant NotificationTokenService cannot sign a token and no email/SMS is ever delivered. */
      grants: [{ resource: 'api://pulse', scope: 'notifications:send' }],
    },
  ],
};
