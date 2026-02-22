/**
 * Importing npm packages
 */
import { afterAll, afterEach, beforeAll, beforeEach } from 'bun:test';

import { Router, ShadowApplication } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { NotificationService } from '@modules/notification';
import { createDatabaseFromTemplate, dropDatabase } from '@scripts/create-template-db';
import { AppModule } from '@server/app.module';
import { APP_NAME } from '@server/constants';
import { PrimaryDatabase } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
Logger.attachTransport('file:json');
const baseConnectionString = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost/shadow_pulse';

export const TEST_REGEX = {
  id: /^\d+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  dateISO: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
} satisfies Record<string, RegExp>;

export class TestEnvironment {
  private static readonly logger = Logger.getLogger(APP_NAME, TestEnvironment.name);

  private readonly app = new ShadowApplication(AppModule);

  constructor(private readonly databaseSuffix: string) {}

  init(): void {
    const databaseName = `${baseConnectionString.split('/').pop()}_${this.databaseSuffix}`;
    TestEnvironment.logger.info(`Setting up test environment with database: '${databaseName}'`);
    Config['cache'].set('database.postgres.url', `${baseConnectionString}_${this.databaseSuffix}`);

    NotificationService.prototype['executeNotificationJob'] = () => Bun.sleep(10);

    beforeEach(() => createDatabaseFromTemplate(databaseName));
    afterEach(() => dropDatabase(databaseName));

    beforeAll(() => this.app.init());
    afterAll(() => this.app.stop());
  }

  getRouter(): FastifyRouter {
    return this.app.get(Router);
  }

  getPostgresClient(): PrimaryDatabase {
    const databaseService = this.app.get(DatabaseService);
    return databaseService.getPostgresClient();
  }
}
