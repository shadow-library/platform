/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach } from 'bun:test';

import { Router, ShadowApplication } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { Redis } from 'ioredis';

/**
 * Importing user defined packages
 */
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { AppModule } from '@server/app.module';
import { APP_NAME } from '@server/constants';
import { PrimaryDatabase } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
Logger.attachTransport('file:json');
const baseConnectionString = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost:5432/shadow_identity';

export const TEST_REGEX = {
  id: /^\d+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  dateISO: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
} satisfies Record<string, RegExp>;

/**
 * Boots the real application against an isolated database cloned from the migrated
 * template before each test, so suites never share mutable state.
 */
export class TestEnvironment {
  private static readonly logger = Logger.getLogger(APP_NAME, TestEnvironment.name);

  private readonly app = new ShadowApplication(AppModule);
  private readonly databaseName: string;

  constructor(databaseSuffix: string) {
    this.databaseName = `${baseConnectionString.split('/').pop()}_${databaseSuffix}`;
  }

  init(): this {
    TestEnvironment.logger.info(`Setting up test environment with database: '${this.databaseName}'`);
    const databaseUrl = baseConnectionString.replace(/\/[^/]*$/, `/${this.databaseName}`);
    Config['cache'].set('database.postgres.url', databaseUrl);

    beforeEach(() => createDatabaseFromTemplate(this.databaseName));
    beforeAll(() => this.app.init());
    afterAll(async () => {
      await this.flushRedis();
      await this.app.stop();
    });
    return this;
  }

  getRouter(): FastifyRouter {
    return this.app.get(Router);
  }

  getPostgresClient(): PrimaryDatabase {
    return this.app.get(DatabaseService).getPostgresClient();
  }

  getRedisClient(): Redis {
    return this.app.get(DatabaseService).getRedisClient();
  }

  private async flushRedis(): Promise<void> {
    await this.getRedisClient()
      .flushdb()
      .catch(() => undefined);
  }
}
