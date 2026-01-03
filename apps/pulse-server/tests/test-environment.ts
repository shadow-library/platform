/**
 * Importing npm packages
 */
import { afterAll, afterEach, beforeAll, beforeEach } from 'bun:test';

import { Router, ShadowApplication } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { FastifyRouter } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { createDatabaseFromTemplate, dropDatabase } from '@scripts/create-template-db';
import { AppModule } from '@server/app.module';
import { APP_NAME } from '@server/constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
Logger.attachTransport('file:json');
const host = process.env.PRIMARY_DATABASE_HOST ?? 'localhost';
const user = process.env.PRIMARY_DATABASE_USER ?? 'admin';
const password = process.env.PRIMARY_DATABASE_PASSWORD ?? 'password';
const baseUrl = `postgresql://${user}:${password}@${host}`;

export const TEST_REGEX = {
  id: /^\d+$/,
  dateISO: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
} satisfies Record<string, RegExp>;

export class TestEnvironment {
  private static readonly logger = Logger.getLogger(APP_NAME, TestEnvironment.name);

  private readonly app = new ShadowApplication(AppModule);

  constructor(private readonly databaseName: string) {}

  async init(): Promise<void> {
    TestEnvironment.logger.info(`Setting up test environment with database: '${this.databaseName}'`);
    Config['cache'].set('db.primary.url', `${baseUrl}/${this.databaseName}`);

    beforeEach(() => createDatabaseFromTemplate(this.databaseName));
    afterEach(() => dropDatabase(this.databaseName));

    beforeAll(() => this.app.init());
    afterAll(() => this.app.stop());
  }

  getRouter(): FastifyRouter {
    return this.app.get(Router);
  }
}
