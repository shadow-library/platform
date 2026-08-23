import { afterAll, beforeAll, beforeEach } from 'bun:test';

import { Class } from 'type-fest';
import { Dispatcher, ShadowApplication } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { AppModule } from '@server/app.module';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

Logger.attachTransport('file:json');
const baseConnectionString = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';

/**
 * Boots the real application against an isolated database cloned from the migrated template before
 * each test, so suites never share mutable state. Mirrors `apps/web-novel-server/tests/test-environment.ts`.
 */
export class TestEnvironment {
  private static readonly logger = Logger.getLogger(APP_NAME, TestEnvironment.name);

  private readonly app = new ShadowApplication(AppModule);
  private readonly databaseName: string;

  constructor(databaseSuffix: string) {
    const suffix = databaseSuffix.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    this.databaseName = `${baseConnectionString.split('/').pop()}_${suffix}`;
  }

  init(): this {
    TestEnvironment.logger.info(`Setting up test environment with database: '${this.databaseName}'`);
    const databaseUrl = baseConnectionString.replace(/\/[^/]*$/, `/${this.databaseName}`);
    Config['cache'].set('database.postgres.url', databaseUrl);

    beforeAll(async () => {
      await createDatabaseFromTemplate(this.databaseName);
      await this.app.init();
    });
    beforeEach(() => createDatabaseFromTemplate(this.databaseName));
    afterAll(() => this.app.stop());
    return this;
  }

  getRouter(): FastifyRouter {
    return this.app.get(Dispatcher) as FastifyRouter;
  }

  getDatabaseService(): DatabaseService {
    return this.app.get(DatabaseService);
  }

  getService<T>(token: Class<T>): T {
    return this.app.get(token);
  }

  getPostgresClient(): PrimaryDatabase {
    return this.app.get(DatabaseService).getPostgresClient();
  }
}
