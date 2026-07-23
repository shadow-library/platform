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
import { OAuthClientService, RegisterClient } from '@server/modules/auth/oauth';
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

/** The pulse application, its OAuth clients and its token audience — mirrors pulse-server's own constants. */
const PULSE_APP = 'pulse';
const PULSE_RESOURCE = 'pulse-server';
const NOTIFICATIONS_SEND_SCOPE = 'notifications:send';
const PULSE_RP_CLIENT = 'pulse';
const PULSE_SERVICE_CLIENT = 'pulse-server';
const IDENTITY_SERVICE_CLIENT = 'identity-server';
const RP_CALLBACK_PATH = '/api/auth/callback';

/** Browser origins that host the pulse relying party; each yields a `{origin}/api/auth/callback` redirect URI. */
const PULSE_PUBLIC_URLS = ['https://pulse.shadow-apps.com', 'http://localhost:8080'];

/**
 * The pulse RBAC catalogue, kept in lockstep with `pulse-server/src/modules/auth/rbac.constants.ts`.
 * SDK role-sync is intentionally off on pulse, so the two lists must be edited together.
 */
const PULSE_PERMISSIONS = {
  templatesRead: 'pulse:templates:read',
  templatesWrite: 'pulse:templates:write',
  sendersRead: 'pulse:senders:read',
  sendersWrite: 'pulse:senders:write',
  metricsRead: 'pulse:metrics:read',
  logsRead: 'pulse:logs:read',
} as const;

const PULSE_PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [PULSE_PERMISSIONS.templatesRead]: 'Read notification templates',
  [PULSE_PERMISSIONS.templatesWrite]: 'Create and edit notification templates',
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

/** Read-only floor; every role builds on it. Operators additionally author templates; admins hold everything. */
const VIEWER_PERMISSIONS = [PULSE_PERMISSIONS.templatesRead, PULSE_PERMISSIONS.sendersRead, PULSE_PERMISSIONS.metricsRead, PULSE_PERMISSIONS.logsRead];
const OPERATOR_PERMISSIONS = [...VIEWER_PERMISSIONS, PULSE_PERMISSIONS.templatesWrite];
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
    await this.ensurePulseClients(pulseApplicationId, scopes);
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

  /** Provisions the pulse API resource + `notifications:send`, and the identity-side authz scopes pulse's SDK needs. */
  private async ensureScopes(pulseApplicationId: number): Promise<{ notificationsSend: string; authzCheck: string; authzRolesSync: string }> {
    const resource = await this.oauthClientService.ensureResource(pulseApplicationId, PULSE_RESOURCE, 'Pulse notification API');
    /** A machine-to-machine capability, so it must never leak into a user token. */
    const notificationsSend = await this.oauthClientService.createScope(resource.id, NOTIFICATIONS_SEND_SCOPE, 'Send notifications through pulse', false, 'SERVICE');

    const platform = this.applicationService.getApplicationOrThrow(APP_NAME);
    const authzCheck = await this.oauthClientService.ensureScope(platform.id, PLATFORM_RESOURCE, AUTHZ_CHECK_SCOPE);
    const authzRolesSync = await this.oauthClientService.ensureScope(platform.id, PLATFORM_RESOURCE, AUTHZ_ROLES_SYNC_SCOPE);
    return { notificationsSend, authzCheck, authzRolesSync };
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

  private async ensurePulseClients(pulseApplicationId: number, scopes: { authzCheck: string; authzRolesSync: string }): Promise<void> {
    await this.ensureClient({
      id: PULSE_RP_CLIENT,
      label: 'pulse relying-party',
      applicationId: pulseApplicationId,
      name: 'Pulse Web',
      kind: 'WEB_CONFIDENTIAL',
      isFirstParty: true,
      grantTypes: ['authorization_code', 'refresh_token'],
      redirectUris: PULSE_PUBLIC_URLS.map(origin => `${origin}${RP_CALLBACK_PATH}`),
    });

    await this.ensureClient({
      id: PULSE_SERVICE_CLIENT,
      label: 'pulse service',
      applicationId: pulseApplicationId,
      name: 'Pulse Server',
      kind: 'SERVICE',
      isFirstParty: true,
      grantTypes: ['client_credentials'],
    });
    /** The SDK loads its service-access rules and calls the PDP, so the service client carries the identity-side authz scopes. */
    await this.oauthClientService.grantScope(PULSE_SERVICE_CLIENT, scopes.authzCheck);
    await this.oauthClientService.grantScope(PULSE_SERVICE_CLIENT, scopes.authzRolesSync);
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
