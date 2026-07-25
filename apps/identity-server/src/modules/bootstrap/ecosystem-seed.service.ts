/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger, throwError } from '@shadow-library/common';

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

/** The identity-side scope ids the ecosystem apps' clients are granted on identity's own platform API. */
interface PlatformScopes {
  notificationsSend: string;
  authzCheck: string;
  authzRolesSync: string;
  appSession: string;
}

/** Static metadata for a seeded first-party application, independent of the deployment domain. */
interface SeededApplication {
  displayName: string;
  description: string;
  /** The API resource display name (`api://<name>` identifier is derived). */
  resourceName: string;
  /** Whether the application carries the pulse-style logo asset. */
  logo?: boolean;
}

/**
 * Declaring the constants
 */
const PLATFORM_RESOURCE = 'shadow-identity';
const AUTHZ_CHECK_SCOPE = 'authz:check';
const AUTHZ_ROLES_SYNC_SCOPE = 'authz:roles:sync';

const APP_SESSION_SCOPE = 'app-session:manage';

/**
 * The three first-party product applications (D-21). Each holds **one** client whose id equals the
 * application name and exposes **one** API resource, `api://<name>`, both derived from the name — the
 * former `<app>` / `<app>-server` client pairs and `<app>-server` audiences are gone, since an id that
 * could mean either of an application's two clients was ambiguous at exactly the moments it mattered.
 */
const PULSE_APP = 'pulse';
const NOVEL_FORGE_APP = 'novel-forge';
const WEBNOVEL_APP = 'webnovel';

const NOTIFICATIONS_SEND_SCOPE = 'notifications:send';
/** Service-only: a user token can never carry it, and only a granted M2M client may request it. */
const WEBNOVEL_PUBLISH_SCOPE = 'webnovel:publish';
const IDENTITY_SERVICE_CLIENT = 'identity-server';

const SEEDED_APPLICATIONS: Record<string, SeededApplication> = {
  [PULSE_APP]: {
    displayName: 'Shadow Pulse',
    description: 'Centralised multi-channel notification platform for the Shadow ecosystem',
    resourceName: 'Pulse notification API',
    logo: true,
  },
  [NOVEL_FORGE_APP]: { displayName: 'Novel Forge', description: 'Long-form fiction authoring platform for the Shadow ecosystem', resourceName: 'Novel Forge API' },
  [WEBNOVEL_APP]: { displayName: 'Webnovel Reader', description: 'Reader-facing web novel catalogue for the Shadow ecosystem', resourceName: 'Webnovel Reader API' },
};

/**
 * In-cluster each application runs in its own namespace as the `<app>-server` service account and
 * authenticates with a projected SA-token assertion rather than a secret (D-16). The subject is the
 * canonical k8s form and is registered as an exact workload binding on the application's client.
 */
const workloadSubject = (app: string): string => `system:serviceaccount:${app}:${app}-server`;

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
 * Idempotently provisions the whole first-party ecosystem the identity platform integrates with
 * (D-21): the three product applications — **pulse** (notifications), **novel-forge** (authoring) and
 * **webnovel** (reader) — each with its single OAuth client (id == app name), its `api://<app>` API
 * resource and its in-cluster workload-identity binding; pulse's RBAC catalogue; the novel-forge →
 * webnovel delegation grant and its service-access rule; and identity's own `identity-server` service
 * client plus the rule that lets identity call pulse's notification API. Without this seed the outbound
 * notification path cannot mint a token ({@link NotificationTokenService} requires the `identity-server`
 * client to hold `notifications:send`), so a clean deployment would silently fail to deliver any email/SMS.
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
    const pulseApplicationId = await this.ensureApplication(PULSE_APP);
    const scopes = await this.ensureScopes(pulseApplicationId);
    await this.ensurePulseRbac(pulseApplicationId);
    /** pulse alone keeps `authz:roles:sync`: its RBAC catalogue is seeded identity-side, not pushed by the SDK. */
    await this.ensureAppClient(pulseApplicationId, PULSE_APP, [scopes.authzCheck, scopes.authzRolesSync, scopes.appSession]);
    await this.ensureIdentityNotificationAccess(pulseApplicationId, scopes.notificationsSend);
    await this.ensureAuthoringApplications(scopes);
  }

  /**
   * Public origins for an application's relying party, derived from the issuer rather than configured
   * so a fresh deployment onto any domain provisions correct redirect URIs. The root domain is the
   * issuer host with its first label dropped (`identity.shadow-apps.test` → `shadow-apps.test`); the
   * app is served at `https://<app>.<root>`. `http://localhost:8080` is added outside production only,
   * as a local-development convenience.
   */
  private appPublicOrigins(app: string): { primary: string; origins: string[] } {
    const root = new URL(Config.get('oauth.issuer')).hostname.split('.').slice(1).join('.');
    const primary = `https://${app}.${root}`;
    return { primary, origins: Config.isProd() ? [primary] : [primary, 'http://localhost:8080'] };
  }

  /** Creates a seeded application from its static metadata and issuer-derived origins; a no-op once it exists. */
  private async ensureApplication(app: string): Promise<number> {
    const existing = this.applicationService.getApplication(app);
    if (existing) return existing.id;
    const meta = SEEDED_APPLICATIONS[app] ?? throwError(AppError.internal(`No seed metadata registered for application '${app}'`));
    const { primary, origins } = this.appPublicOrigins(app);
    const application = await this.applicationService.createApplication({
      name: app,
      subDomain: app,
      displayName: meta.displayName,
      description: meta.description,
      homePageUrl: primary,
      ...(meta.logo ? { logoUrl: `${primary}/logo192.png` } : {}),
      publicUrls: origins,
    });
    this.logger.info(`Seeded ecosystem application '${app}'`, { applicationId: application.id });
    return application.id;
  }

  /** Provisions the pulse API resource + `notifications:send`, and the identity-side platform scopes every app's SDK needs. */
  private async ensureScopes(pulseApplicationId: number): Promise<PlatformScopes> {
    const resource = await this.oauthClientService.ensureResource(pulseApplicationId, applicationAudience(PULSE_APP), SEEDED_APPLICATIONS[PULSE_APP]?.resourceName);
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
   * the server-to-server calls, because they are one deployment and therefore one identity. The client
   * is granted the platform scopes its SDK needs and bound to the application's in-cluster SA subject,
   * so a pod authenticates with a projected token and no secret ever leaves the cluster (D-16). The
   * minted `client_secret` remains the credential for any out-of-cluster caller. Idempotent throughout.
   */
  private async ensureAppClient(applicationId: number, app: string, platformScopeIds: string[]): Promise<string> {
    const { origins } = this.appPublicOrigins(app);
    const provisioned = await this.oauthClientService.provisionApplicationIdentity({ applicationId, name: app, publicUrls: origins, isFirstParty: true });
    if (provisioned.created && provisioned.secret) {
      this.logger.warn(`Seeded ${app} client '${provisioned.clientId}' — store this secret now, it is shown only once: ${provisioned.secret}`, { clientId: provisioned.clientId });
    }

    for (const scopeId of platformScopeIds) await this.oauthClientService.grantScope(provisioned.clientId, scopeId);
    await this.oauthClientService.updateClient(provisioned.clientId, { workloadSubjects: [workloadSubject(app)] });
    return provisioned.clientId;
  }

  /**
   * The two authoring-side applications (D-21): novel-forge and webnovel, each provisioned exactly like
   * pulse. webnovel additionally defines the service-only `webnovel:publish` scope, which novel-forge is
   * granted as its delegation ceiling (D-22, surfaced by `GET /api/v1/apps/me` as a grant) and reaches
   * through a deny-by-default service-access rule on webnovel's internal routes (D-17).
   */
  private async ensureAuthoringApplications(scopes: PlatformScopes): Promise<void> {
    const novelForgeId = await this.ensureApplication(NOVEL_FORGE_APP);
    await this.oauthClientService.ensureResource(novelForgeId, applicationAudience(NOVEL_FORGE_APP), SEEDED_APPLICATIONS[NOVEL_FORGE_APP]?.resourceName);
    await this.ensureAppClient(novelForgeId, NOVEL_FORGE_APP, [scopes.authzCheck, scopes.appSession]);

    const webnovelId = await this.ensureApplication(WEBNOVEL_APP);
    const webnovelResource = await this.oauthClientService.ensureResource(webnovelId, applicationAudience(WEBNOVEL_APP), SEEDED_APPLICATIONS[WEBNOVEL_APP]?.resourceName);
    const publishScopeId = await this.oauthClientService.createScope(webnovelResource.id, WEBNOVEL_PUBLISH_SCOPE, 'Publish rendered novels to the reader', false, 'SERVICE');
    await this.ensureAppClient(webnovelId, WEBNOVEL_APP, [scopes.authzCheck, scopes.appSession]);

    /** novel-forge delegates onto webnovel: its grant on `webnovel:publish` is the ceiling `/apps/me` surfaces. */
    await this.oauthClientService.grantScope(NOVEL_FORGE_APP, publishScopeId);
    await this.serviceAccessService.create({
      applicationId: webnovelId,
      callerClientId: NOVEL_FORGE_APP,
      method: '*',
      pathPattern: '/internal/*',
      createdBy: EcosystemSeedService.name,
    });
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
