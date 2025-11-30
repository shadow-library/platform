/**
 * Importing npm packages
 */
import { Module, OnModuleInit } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { DatastoreModule } from '@modules/infrastructure/datastore';
import { APP_NAME } from '@server/constants';

import { ApplicationRoleService } from './application-role.service';
import { ApplicationService } from './application.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatastoreModule],
  providers: [ApplicationService, ApplicationRoleService],
})
export class ApplicationModule implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, ApplicationModule.name);

  constructor(
    private readonly applicationService: ApplicationService,
    private readonly applicationRoleService: ApplicationRoleService,
  ) {}

  async onModuleInit(): Promise<void> {
    const identityApplication = this.applicationService.getApplication(APP_NAME);
    if (identityApplication) {
      this.logger.info(`Application '${APP_NAME}' already exists.`);
      return;
    }

    this.logger.info(`No application '${APP_NAME}' found, creating one`);
    const application = await this.applicationService.createApplication({ name: APP_NAME, subDomain: 'identity' });
    const roles = await this.applicationRoleService.addRole(APP_NAME, { roleName: 'IAMAdmin', description: 'Administrator role with full access' });
    this.logger.info(`Created application '${APP_NAME}' with ID ${application.id}`, { application, roles });
  }
}
