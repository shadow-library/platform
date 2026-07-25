/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { applicationAudience, OAuthClientService, RegisterClient } from '@server/modules/auth/oauth';
import { PolicyDecisionService, ServiceAccessService } from '@server/modules/authz';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

/**
 * Defining types
 */

interface SeededClient extends RegisterClient {
  /** Human label used only in the first-boot credential log line. */
  label: string;
}

/**
 * Declaring the constants
 */
const PLATFORM_RESOURCE = 'shadow-identity';
const AUTHZ_CHECK_SCOPE = 'authz:check';
const AUTHZ_ROLES_SYNC_SCOPE = 'authz:roles:sync';

const APP_SESSION_SCOPE = 'app-session:manage';

/**
 * The pulse application. Under D-21 it holds **one** client (`pulse`) and exposes **one** API
 * resource, `api://pulse`, both derived from the application name — the former `pulse` / `pulse-server`
 * client pair and the `pulse-server` audience are gone, since an id that could mean either of an
 * application's two clients was ambiguous at exactly the moments it mattered.
 */
const PULSE_APP = 'pulse';
const NOTIFICATIONS_SEND_SCOPE = 'notifications:send';
const IDENTITY_SERVICE_CLIENT = 'identity-server';

/** Browser origins that host the pulse relying party; each yields a `{origin}/api/auth/callback` redirect URI. */
const PULSE_PUBLIC_URLS = ['https://pulse.shadow-apps.com', 'http://localhost:8080'];

/**
 * The pulse RBAC catalogue, kept in lockstep with `pulse-server/src/modules/auth/rbac.constants.ts`.
 * SDK role-sync is intentionally off on pulse, so the two lists must be edited together.
 */
const PULSE_PERMISSIONS = {
  templatesRead: 'pulse:templates:read',
  templatesWrite: 'pulse:templates:write',
  templatesPublish: 'pulse:templates:publish',
  layoutsWrite: 'pulse:layouts:write',
  sendersRead: 'pulse:senders:read',
  sendersWrite: 'pulse:senders:write',
  metricsRead: 'pulse:metrics:read',
  logsRead: 'pulse:logs:read',
} as const;

const PULSE_PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [PULSE_PERMISSIONS.templatesRead]: 'Read notification templates',
  [PULSE_PERMISSIONS.templatesWrite]: 'Create and edit notification template drafts',
  [PULSE_PERMISSIONS.templatesPublish]: 'Publish and roll back notification template versions',
  [PULSE_PERMISSIONS.layoutsWrite]: 'Manage the shared design system (email layouts and partials)',
  [PULSE_PERMISSIONS.sendersRead]: 'Read sender profiles, endpoints and routing rules',
  [PULSE_PERMISSIONS.sendersWrite]: 'Manage sender profiles, endpoints and routing rules',
  [PULSE_PERMISSIONS.metricsRead]: 'Read delivery metrics and dashboards',
  [PULSE_PERMISSIONS.logsRead]: 'Read notification delivery logs',
};

const PULSE_ROLES = {
  admin: 'PulseAdmin',
  operator: 'PulseOperator',
  viewer: 'PulseViewer',
} as const;

/** Read-only floor; every role builds on it. Operators author, publish and manage the design system; admins hold everything. */
const VIEWER_PERMISSIONS = [PULSE_PERMISSIONS.templatesRead, PULSE_PERMISSIONS.sendersRead, PULSE_PERMISSIONS.metricsRead, PULSE_PERMISSIONS.logsRead];
const OPERATOR_PERMISSIONS = [...VIEWER_PERMISSIONS, PULSE_PERMISSIONS.templatesWrite, PULSE_PERMISSIONS.templatesPublish, PULSE_PERMISSIONS.layoutsWrite];
const ADMIN_PERMISSIONS = Object.values(PULSE_PERMISSIONS);

const PULSE_ROLE_GRANTS: { role: string; description: string; permissions: readonly string[] }[] = [
  { role: PULSE_ROLES.viewer, description: 'Read-only access to pulse templates, senders, metrics and logs', permissions: VIEWER_PERMISSIONS },
  { role: PULSE_ROLES.operator, description: 'Day-to-day operator: reads everything and authors templates', permissions: OPERATOR_PERMISSIONS },
  { role: PULSE_ROLES.admin, description: 'Full control over pulse templates, senders and configuration', permissions: ADMIN_PERMISSIONS },
];

/**
 * Idempotently provisions the first-party ecosystem that the identity platform integrates with today:
 * the **pulse** notification application (its OAuth clients, API resource, scopes and RBAC catalogue),
 * plus identity's own `identity-server` service client and the service-access rule that lets identity
 * call pulse's notification API. Without this seed the outbound notification path cannot mint a token
 * ({@link NotificationTokenService} requires the `identity-server` client to hold `notifications:send`),
 * so a clean deployment would silently fail to deliver any email/SMS.
 *
 * Runs after {@link BootstrapService} has provisioned the platform application, and is a no-op once the
 * records exist — safe under horizontal scaling and repeated restarts.
 */
@Injectable()
export class EcosystemSeedService {
  private readonly logger = Logger.getLogger(APP_NAME, EcosystemSeedService.name);

  constructor(
    private readonly applicationService: ApplicationService,
    private readonly applicationRoleService: ApplicationRoleService,
    private readonly oauthClientService: OAuthClientService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly serviceAccessService: ServiceAccessService,
  ) {}

  async seed(): Promise<void> {
    const pulseApplicationId = await this.ensurePulseApplication();
    const scopes = await this.ensureScopes(pulseApplicationId);
    await this.ensurePulseRbac(pulseApplicationId);
    await this.ensurePulseClient(pulseApplicationId, scopes);
    await this.ensureIdentityNotificationAccess(pulseApplicationId, scopes.notificationsSend);
  }

  private async ensurePulseApplication(): Promise<number> {
    const existing = this.applicationService.getApplication(PULSE_APP);
    if (existing) return existing.id;
    const application = await this.applicationService.createApplication({
      name: PULSE_APP,
      subDomain: 'pulse',
      displayName: 'Shadow Pulse',
      description: 'Centralised multi-channel notification platform for the Shadow ecosystem',
      homePageUrl: 'https://pulse.shadow-apps.com',
      logoUrl: 'https://pulse.shadow-apps.com/logo192.png',
      publicUrls: PULSE_PUBLIC_URLS,
    });
    this.logger.info(`Seeded ecosystem application '${PULSE_APP}'`, { applicationId: application.id });
    return application.id;
  }

  /** Provisions the pulse API resource + `notifications:send`, and the identity-side platform scopes pulse's SDK needs. */
  private async ensureScopes(pulseApplicationId: number): Promise<{ notificationsSend: string; authzCheck: string; authzRolesSync: string; appSession: string }> {
    const resource = await this.oauthClientService.ensureResource(pulseApplicationId, applicationAudience(PULSE_APP), 'Pulse notification API');
    /** A machine-to-machine capability, so it must never leak into a user token. */
    const notificationsSend = await this.oauthClientService.createScope(resource.id, NOTIFICATIONS_SEND_SCOPE, 'Send notifications through pulse', false, 'SERVICE');

    const platform = this.applicationService.getApplicationOrThrow(APP_NAME);
    const authzCheck = await this.oauthClientService.ensureScope(platform.id, PLATFORM_RESOURCE, AUTHZ_CHECK_SCOPE);
    const authzRolesSync = await this.oauthClientService.ensureScope(platform.id, PLATFORM_RESOURCE, AUTHZ_ROLES_SYNC_SCOPE);
    const appSession = await this.oauthClientService.ensureScope(platform.id, PLATFORM_RESOURCE, APP_SESSION_SCOPE);
    return { notificationsSend, authzCheck, authzRolesSync, appSession };
  }

  private async ensurePulseRbac(pulseApplicationId: number): Promise<void> {
    const permissionIds = new Map<string, string>();
    for (const [name, description] of Object.entries(PULSE_PERMISSION_DESCRIPTIONS)) {
      permissionIds.set(name, await this.policyDecisionService.ensurePermission(pulseApplicationId, name, description));
    }

    for (const grant of PULSE_ROLE_GRANTS) {
      const roleId = await this.ensureRole(grant.role, grant.description);
      for (const permission of grant.permissions) {
        const permissionId = permissionIds.get(permission);
        if (permissionId) await this.policyDecisionService.grantPermissionToRole(roleId, permissionId);
      }
    }
  }

  /** Returns the role id, creating the role on the pulse application only if it is missing. */
  private async ensureRole(roleName: string, description: string): Promise<number> {
    const existing = this.applicationService.getApplicationOrThrow(PULSE_APP).roles.find(role => role.roleName === roleName);
    if (existing) return existing.id;
    const role = await this.applicationRoleService.addRole(PULSE_APP, { roleName, description });
    return role.id;
  }

  /**
   * One client for the whole application (D-21): the same credential runs the browser code flow and
   * the server-to-server calls, because they are one deployment and therefore one identity.
   */
  private async ensurePulseClient(pulseApplicationId: number, scopes: { authzCheck: string; authzRolesSync: string; appSession: string }): Promise<void> {
    const provisioned = await this.oauthClientService.provisionApplicationIdentity({
      applicationId: pulseApplicationId,
      name: PULSE_APP,
      publicUrls: PULSE_PUBLIC_URLS,
      isFirstParty: true,
    });
    if (provisioned.created && provisioned.secret) {
      this.logger.warn(`Seeded pulse client '${provisioned.clientId}' — store this secret now, it is shown only once: ${provisioned.secret}`, { clientId: provisioned.clientId });
    }

    /** The SDK loads its service-access rules, calls the PDP and opens app sessions for its users. */
    await this.oauthClientService.grantScope(provisioned.clientId, scopes.authzCheck);
    await this.oauthClientService.grantScope(provisioned.clientId, scopes.authzRolesSync);
    await this.oauthClientService.grantScope(provisioned.clientId, scopes.appSession);
  }

  /**
   * Provisions identity's own outbound service client and everything the notification path needs:
   * the `notifications:send` grant ({@link NotificationTokenService} verifies it before signing) and
   * the deny-by-default route rule pulse enforces for `POST /api/v1/notifications`.
   */
  private async ensureIdentityNotificationAccess(pulseApplicationId: number, notificationsSendScopeId: string): Promise<void> {
    const platform = this.applicationService.getApplicationOrThrow(APP_NAME);
    await this.ensureClient({
      id: IDENTITY_SERVICE_CLIENT,
      label: 'identity outbound',
      applicationId: platform.id,
      /** The lookup in NotificationTokenService matches on this exact name, so it must stay `identity-server`. */
      name: IDENTITY_SERVICE_CLIENT,
      kind: 'SERVICE',
      isFirstParty: true,
      grantTypes: ['client_credentials'],
    });
    await this.oauthClientService.grantScope(IDENTITY_SERVICE_CLIENT, notificationsSendScopeId);

    await this.serviceAccessService.create({
      applicationId: pulseApplicationId,
      callerClientId: IDENTITY_SERVICE_CLIENT,
      method: 'POST',
      pathPattern: '/api/v1/notifications',
      createdBy: EcosystemSeedService.name,
    });
  }

  /** Registers a client only when absent; the generated secret is logged once, mirroring the bootstrap admin password. */
  private async ensureClient(client: SeededClient): Promise<void> {
    const { label, ...input } = client;
    if (await this.oauthClientService.getClient(input.id as string)) return;
    const { clientId, secret } = await this.oauthClientService.register(input);
    if (secret) this.logger.warn(`Seeded ${label} client '${clientId}' — store this secret now, it is shown only once: ${secret}`, { clientId });
    else this.logger.info(`Seeded ${label} client '${clientId}'`, { clientId });
  }
}
