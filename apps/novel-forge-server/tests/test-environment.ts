/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach } from 'bun:test';

import { Router, ShadowApplication } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { type AbstractClass, type Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { AppModule } from '@server/app.module';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

Logger.attachTransport('file:json');
const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';

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

    beforeEach(() => createDatabaseFromTemplate(databaseName));
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

  getService<T>(token: Class<T> | AbstractClass<T>): T {
    return this.app.get(token);
  }
}
