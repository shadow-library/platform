/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes/app-error-code';
import { APP_NAME } from '@server/constants';
import { Application, DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { ApplicationService } from './application.service';

/**
 * Defining types
 */

export interface IRole {
  roleName: string;
  description?: string;
}

/**
 * Declaring the constants
 */

@Injectable()
export class ApplicationRoleService {
  private readonly logger = Logger.getLogger(APP_NAME, ApplicationRoleService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly applicationService: ApplicationService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async getRole(roleId: number): Promise<Application.Role | null> {
    const role = await this.db.query.applicationRoles.findFirst({ where: eq(schema.applicationRoles.id, roleId) });
    return role ?? null;
  }

  async addRole(service: string, newRole: IRole): Promise<Application.Role> {
    const application = this.applicationService.getApplicationOrThrow(service);
    const data = { applicationId: application.id, roleName: newRole.roleName, description: newRole.description };
    const [role] = await this.db
      .insert(schema.applicationRoles)
      .values(data)
      .returning()
      .catch(error => this.databaseService.translateError(error));
    assert(role, `Failed to add role ${newRole.roleName} to application ${service}`);
    this.logger.info(`added new role to the application ${service}: ${newRole.roleName}`);
    await this.applicationService.loadApplications();
    return role;
  }

  async updateRole(roleId: number, update: Partial<IRole>): Promise<Application.Role> {
    const condition = eq(schema.applicationRoles.id, roleId);
    const [role] = await this.db
      .update(schema.applicationRoles)
      .set(update)
      .where(condition)
      .returning()
      .catch(error => this.databaseService.translateError(error));
    if (!role) throw AppErrorCode.APP_003.create();
    this.logger.info(`Updated role with ID ${roleId}`, { update });
    await this.applicationService.loadApplications();
    return role;
  }

  async deleteRole(roleId: number): Promise<Application.Role> {
    const condition = eq(schema.applicationRoles.id, roleId);
    const [role] = await this.db
      .delete(schema.applicationRoles)
      .where(condition)
      .returning()
      .catch(error => this.databaseService.translateError(error));
    if (!role) throw AppErrorCode.APP_003.create();
    await this.applicationService.loadApplications();
    this.logger.info(`Deleted role with ID ${roleId}`);
    return role;
  }
}
