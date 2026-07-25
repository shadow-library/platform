/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { Injectable, OnModuleInit } from '@shadow-library/app';
import { AppError, Config, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { ADMIN_PERMISSIONS, IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin/admin.constants';
import { APP_SESSION_SCOPE } from '@server/modules/auth/app-session';
import { applicationAudience, OAuthClientService } from '@server/modules/auth/oauth';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

import { EcosystemSeedService } from './ecosystem-seed.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const PLATFORM_RESOURCE = 'shadow-identity';
const AUTHZ_CHECK_SCOPE = 'authz:check';
const SCIM_PROVISION_SCOPE = 'scim:provision';

const ADMIN_PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [ADMIN_PERMISSIONS.usersRead]: 'Read user accounts and their security posture',
  [ADMIN_PERMISSIONS.usersManage]: 'Lock, unlock, reset and lifecycle user accounts',
  [ADMIN_PERMISSIONS.appsRead]: 'Read applications and their metadata',
  [ADMIN_PERMISSIONS.appsManage]: 'Register, update and delete applications',
  [ADMIN_PERMISSIONS.clientsRead]: 'Read OAuth clients, resources and scopes',
  [ADMIN_PERMISSIONS.clientsManage]: 'Register and manage OAuth clients, resources and scopes',
  [ADMIN_PERMISSIONS.rolesManage]: 'Manage roles, permissions and assignments platform-wide',
  [ADMIN_PERMISSIONS.auditRead]: 'Read audit trails',
  [ADMIN_PERMISSIONS.webhooksManage]: 'Manage webhook subscriptions and deliveries',
  [ADMIN_PERMISSIONS.appRolesManage]: 'Manage roles and assignments of the owning application only',
};

/**
 * Idempotently provisions the records the platform cannot run without: the identity application
 * itself, its administrator role and permission taxonomy, the platform organisation that scopes
 * administrative role assignments, and a bootstrap administrator account. Runs on every boot and
 * is a no-op once the records exist, so it is safe under horizontal scaling and repeated restarts.
 *
 * First-party ecosystem applications (currently pulse) are provisioned by {@link EcosystemSeedService},
 * invoked as the final bootstrap step so it can rely on the platform application already existing; any
 * other consumer application is registered by an administrator through the console.
 */
@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, BootstrapService.name);

  constructor(
    private readonly applicationService: ApplicationService,
    private readonly applicationRoleService: ApplicationRoleService,
    private readonly userService: UserService,
    private readonly oauthClientService: OAuthClientService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly organisationService: OrganisationService,
    private readonly ecosystemSeedService: EcosystemSeedService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePlatformApplication();
    await this.ensurePlatformScopes();
    const organisationId = await this.ensurePlatformOrganisation();
    await this.ensureAdminAuthorization();
    await this.ensureBootstrapAdmin(organisationId);
    await this.ensureFirstPartyRegistrations();
    /** Runs last: the ecosystem seed provisions pulse and identity's outbound client on top of the platform records above. */
    await this.ecosystemSeedService.seed();
  }

  /**
   * Registers the first-party ecosystem's API resources and cross-service scopes so audience/scope
   * validation (RFC 8707 + the scope-grant ceiling) has something to validate against — previously
   * these lived only in a manually-populated database, so a fresh deployment could not issue a
   * correctly-audienced token. Idempotent: safe on every boot. Clients themselves (with their
   * secrets/redirect URIs) are still registered through the console; only resources, the
   * service-only publish scope, and its grant to the existing publisher client are seeded here.
   * The pulse application (with its clients) is provisioned separately by {@link EcosystemSeedService}.
   */
  private async ensureFirstPartyRegistrations(): Promise<void> {
    const novelForge = await this.ensureApplication('novel-forge');
    await this.oauthClientService.ensureResource(novelForge.id, applicationAudience('novel-forge'), 'Novel Forge API');

    const webnovel = await this.ensureApplication('webnovel');
    const webnovelResource = await this.oauthClientService.ensureResource(webnovel.id, applicationAudience('webnovel'), 'Webnovel Reader API');
    /** `webnovel:publish` is service-only: a user token can never carry it, and only the granted M2M client can request it. */
    const publishScopeId = await this.oauthClientService.createScope(webnovelResource.id, 'webnovel:publish', 'Publish rendered novels to the reader', false, 'SERVICE');

    const publisher = await this.oauthClientService.getClient('novel-forge-service');
    if (publisher) {
      await this.oauthClientService.grantScope(publisher.id, publishScopeId);
      this.logger.info("Granted 'webnovel:publish' to the novel-forge service client");
    }
  }

  /** Ensures a first-party application exists (idempotent); consumer clients are still console-registered. */
  private async ensureApplication(name: string): Promise<{ id: number }> {
    return this.applicationService.getApplication(name) ?? (await this.applicationService.createApplication({ name, subDomain: name }));
  }

  /**
   * The PDP endpoint demands a service token carrying `authz:check`; the scope must therefore
   * exist before any client can be granted it. Runs unconditionally so existing deployments pick
   * it up on upgrade.
   */
  private async ensurePlatformScopes(): Promise<void> {
    const application = this.applicationService.getApplicationOrThrow(APP_NAME);
    await this.oauthClientService.ensureScope(application.id, PLATFORM_RESOURCE, AUTHZ_CHECK_SCOPE);
    await this.oauthClientService.ensureScope(application.id, PLATFORM_RESOURCE, SCIM_PROVISION_SCOPE);
    await this.oauthClientService.ensureScope(application.id, PLATFORM_RESOURCE, APP_SESSION_SCOPE);
  }

  private async ensurePlatformApplication(): Promise<void> {
    if (this.applicationService.getApplication(APP_NAME)) return;
    const application = await this.applicationService.createApplication({ name: APP_NAME, subDomain: 'identity' });
    await this.applicationRoleService.addRole(APP_NAME, { roleName: IAM_ADMIN_ROLE, description: 'Administrator role with full access to the identity platform' });
    this.logger.info(`Bootstrapped platform application '${APP_NAME}'`, { applicationId: application.id });
  }

  /** Administrative role assignments are org-scoped (D-1), so platform admins need a platform org. */
  private async ensurePlatformOrganisation(): Promise<bigint> {
    const organisation = await this.organisationService.ensureTeamOrganisation(PLATFORM_ORG_NAME);
    return organisation.id;
  }

  /** Seeds the admin permission taxonomy (T-601) and grants all of it to the IAMAdmin role. */
  private async ensureAdminAuthorization(): Promise<void> {
    const application = this.applicationService.getApplicationOrThrow(APP_NAME);
    const role =
      application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE) ??
      throwError(AppError.internal(`Role '${IAM_ADMIN_ROLE}' is missing from the platform application`));

    for (const permission of Object.values(ADMIN_PERMISSIONS)) {
      const permissionId = await this.policyDecisionService.ensurePermission(application.id, permission, ADMIN_PERMISSION_DESCRIPTIONS[permission]);
      await this.policyDecisionService.grantPermissionToRole(role.id, permissionId);
    }
  }

  private async ensureBootstrapAdmin(organisationId: bigint): Promise<void> {
    const email = Config.get('auth.bootstrap.admin-email');
    let admin = await this.userService.getUser(email);

    if (!admin) {
      const configuredPassword = Config.get('auth.bootstrap.admin-password');
      const password = configuredPassword || this.generatePassword();
      /**
       * The seed password only exists to bootstrap the very first sign-in: `passwordResetRequired`
       * makes that first login refuse the credential and route the admin through recovery to set
       * their own password (T-602), so a shared/default secret is never left standing.
       */
      admin = await this.userService.createUserWithPassword({
        email,
        password,
        firstName: 'Platform',
        lastName: 'Admin',
        emailVerified: true,
        status: 'ACTIVE',
        passwordResetRequired: true,
      });
      if (!configuredPassword) this.logger.warn(`Generated bootstrap admin password (used once to start the forced password reset): ${password}`, { email });
      this.logger.info('Bootstrapped platform administrator — first sign-in requires a password reset', { userId: admin.id, email });
    }

    /** Membership and role assignment run even for a pre-existing admin so upgrades converge. */
    const application = this.applicationService.getApplicationOrThrow(APP_NAME);
    const role =
      application.roles.find(candidate => candidate.roleName === IAM_ADMIN_ROLE) ??
      throwError(AppError.internal(`Role '${IAM_ADMIN_ROLE}' is missing from the platform application`));
    await this.organisationService.ensureMember(organisationId, admin.id, 'OWNER');
    await this.policyDecisionService.assignRole({ type: 'USER', id: admin.id.toString() }, role.id, organisationId.toString());
  }

  /** Generates a password that satisfies the strong-password policy without a static literal. */
  private generatePassword(): string {
    return `${randomBytes(24).toString('base64url')}Aa1!`;
  }
}
