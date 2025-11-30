/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Injectable, OnModuleInit } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { InferInsertModel, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { Application, DatastoreService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

type IApplication = Omit<InferInsertModel<typeof schema.applications>, 'id' | 'createdAt' | 'updatedAt'>;

export interface ApplicationDetails extends Application {
  roles: Application.Role[];
  keys: Application.Key[];
}

export interface CreateApplication {
  name: string;
  description?: string;
  displayName?: string;

  homePageUrl?: string;
  isActive?: boolean;
  logoUrl?: string;
}

/**
 * Declaring the constants
 */

@Injectable()
export class ApplicationService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, ApplicationService.name);
  private readonly db: PrimaryDatabase;

  private cache = new Map<string, ApplicationDetails>();

  constructor(private readonly datastoreService: DatastoreService) {
    this.db = datastoreService.getPrimaryDatabase();
  }

  async onModuleInit(): Promise<void> {
    await this.loadApplications();
  }

  async loadApplications(): Promise<void> {
    const applications = await this.db.query.applications.findMany({ with: { roles: true, keys: true } });
    const cache = new Map<string, ApplicationDetails>();
    for (const application of applications) cache.set(application.name, application);
    this.cache = cache;
    this.logger.info(`Loaded ${applications.length} applications into cache`);
  }

  async createApplication(application: IApplication): Promise<Application> {
    const [record] = await this.db
      .insert(schema.applications)
      .values(application)
      .returning()
      .catch(error => this.datastoreService.translateError(error));

    assert(record, 'Failed to create application');
    this.logger.info(`Created application with ID ${record.id} and name ${record.name}`);
    this.loadApplications();
    return record;
  }

  async updateApplication(name: string, update: Partial<IApplication>): Promise<Application> {
    const condition = eq(schema.applications.name, name);
    const [application] = await this.db
      .update(schema.applications)
      .set(update)
      .where(condition)
      .returning()
      .catch(error => this.datastoreService.translateError(error));
    assert(application, `Failed to update application with name ${name}`);

    this.logger.info(`Updated application with ID ${application.id} and name ${application.name}`, { update });
    this.loadApplications();
    return application;
  }

  async deleteApplication(name: string): Promise<void> {
    const condition = eq(schema.applications.name, name);
    const [application] = await this.db
      .delete(schema.applications)
      .where(condition)
      .returning()
      .catch(error => this.datastoreService.translateError(error));
    assert(application, `Failed to delete application with name ${name}`);

    this.cache.delete(name);
    this.logger.info(`Deleted application with name ${name}`, { application });
  }

  getApplication(name: string): ApplicationDetails | null {
    return this.cache.get(name) ?? null;
  }

  getApplicationOrThrow(name: string): ApplicationDetails {
    const application = this.getApplication(name);
    if (!application) throw new ServerError(AppErrorCode.APP_001);
    return application;
  }

  listApplications(): Application[] {
    return Array.from(this.cache.values());
  }
}
