/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { Injectable, OnModuleInit } from '@shadow-library/app';
import { Config, InternalError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { ADMIN_PERMISSIONS, IAM_ADMIN_ROLE, PLATFORM_ORG_NAME } from '@server/modules/admin/admin.constants';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { PolicyDecisionService } from '@server/modules/authz';
import { OrganisationService } from '@server/modules/identity/organisation';
import { UserService } from '@server/modules/identity/user';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePlatformApplication();
    await this.ensurePlatformScopes();
    const organisationId = await this.ensurePlatformOrganisation();
    await this.ensureAdminAuthorization();
    await this.ensureBootstrapAdmin(organisationId);
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
      throwError(new InternalError(`Role '${IAM_ADMIN_ROLE}' is missing from the platform application`));

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
      throwError(new InternalError(`Role '${IAM_ADMIN_ROLE}' is missing from the platform application`));
    await this.organisationService.ensureMember(organisationId, admin.id, 'OWNER');
    await this.policyDecisionService.assignRole({ type: 'USER', id: admin.id.toString() }, role.id, organisationId.toString());
  }

  /** Generates a password that satisfies the strong-password policy without a static literal. */
  private generatePassword(): string {
    return `${randomBytes(24).toString('base64url')}Aa1!`;
  }
}
