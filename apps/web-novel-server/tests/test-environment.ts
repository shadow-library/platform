import { afterAll, beforeAll, beforeEach } from 'bun:test';
import { randomBytes } from 'node:crypto';

import { Class } from 'type-fest';
import { Dispatcher, ShadowApplication } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { AppModule } from '@server/app.module';
import { APP_NAME } from '@server/constants';
import { PrimaryDatabase } from '@server/modules/datastore';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

Logger.attachTransport('file:json');
const baseConnectionString = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost:7070/shadow_webnovel';

export const TEST_REGEX = {
  id: /^\d+$/,
  dateISO: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
} satisfies Record<string, RegExp>;

/**
 * Builds a valid double-submit CSRF pair for cookie-authenticated mutations: the http-core
 * middleware requires the `csrf-token` cookie (`<expiry base36>:<token>`) to match the
 * `x-csrf-token` header on any request that carries cookies.
 */
export function csrfPair(): { cookie: string; header: string } {
  const token = randomBytes(16).toString('hex');
  const expiry = (Date.now() + 60_000).toString(36);
  return { cookie: `${expiry}:${token}`, header: token };
}

/**
 * Boots the real application against an isolated database cloned from the migrated
 * template before each test, so suites never share mutable state.
 */
export class TestEnvironment {
  private static readonly logger = Logger.getLogger(APP_NAME, TestEnvironment.name);

  private readonly app = new ShadowApplication(AppModule);
  private readonly databaseName: string;
  private databaseUrl = '';

  constructor(databaseSuffix: string) {
    const suffix = databaseSuffix.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    this.databaseName = `${baseConnectionString.split('/').pop()}_${suffix}`;
  }

  init(): this {
    TestEnvironment.logger.info(`Setting up test environment with database: '${this.databaseName}'`);
    this.databaseUrl = baseConnectionString.replace(/\/[^/]*$/, `/${this.databaseName}`);
    Config['cache'].set('database.postgres.url', this.databaseUrl);

    beforeAll(async () => {
      await createDatabaseFromTemplate(this.databaseName);
      await this.app.init();
    });
    beforeEach(() => createDatabaseFromTemplate(this.databaseName));
    afterAll(() => this.app.stop());
    return this;
  }

  getDatabaseUrl(): string {
    return this.databaseUrl;
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
