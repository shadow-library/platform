/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { Injectable, OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { UserService } from '@server/modules/identity/user';
import { ApplicationRoleService, ApplicationService } from '@server/modules/system/application';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const IAM_ADMIN_ROLE = 'IAMAdmin';
const PLATFORM_RESOURCE = 'shadow-identity';
const AUTHZ_CHECK_SCOPE = 'authz:check';

/**
 * Idempotently provisions the records the platform cannot run without: the identity application
 * itself, its administrator role, and a bootstrap administrator account. Runs on every boot and
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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePlatformApplication();
    await this.ensurePlatformScopes();
    await this.ensureBootstrapAdmin();
  }

  /**
   * The PDP endpoint demands a service token carrying `authz:check`; the scope must therefore
   * exist before any client can be granted it. Runs unconditionally so existing deployments pick
   * it up on upgrade.
   */
  private async ensurePlatformScopes(): Promise<void> {
    const application = this.applicationService.getApplicationOrThrow(APP_NAME);
    await this.oauthClientService.ensureScope(application.id, PLATFORM_RESOURCE, AUTHZ_CHECK_SCOPE);
  }

  private async ensurePlatformApplication(): Promise<void> {
    if (this.applicationService.getApplication(APP_NAME)) return;
    const application = await this.applicationService.createApplication({ name: APP_NAME, subDomain: 'identity' });
    await this.applicationRoleService.addRole(APP_NAME, { roleName: IAM_ADMIN_ROLE, description: 'Administrator role with full access to the identity platform' });
    this.logger.info(`Bootstrapped platform application '${APP_NAME}'`, { applicationId: application.id });
  }

  private async ensureBootstrapAdmin(): Promise<void> {
    const email = Config.get('auth.bootstrap.admin-email');
    if (await this.userService.getUser(email)) return;

    const configuredPassword = Config.get('auth.bootstrap.admin-password');
    const password = configuredPassword || this.generatePassword();
    const admin = await this.userService.createUserWithPassword({ email, password, firstName: 'Platform', lastName: 'Admin', emailVerified: true, status: 'ACTIVE' });

    if (!configuredPassword) this.logger.warn(`Generated bootstrap admin password (shown once — sign in and rotate immediately): ${password}`, { email });
    this.logger.info('Bootstrapped platform administrator', { userId: admin.id, email });
  }

  /** Generates a password that satisfies the strong-password policy without a static literal. */
  private generatePassword(): string {
    return `${randomBytes(24).toString('base64url')}Aa1!`;
  }
}
