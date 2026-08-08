/**
 * The test IdP must be evaluated (and its issuer seeded into the config cache) before anything
 * touches the app module graph, so its import lives up here rather than with the other user
 * imports.
 */
import './test-idp';

import { afterAll, beforeAll, beforeEach } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type AbstractClass, type Class } from 'type-fest';
import { Dispatcher, ShadowApplication } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

export interface GetRouterOptions {
  /** Pass `false` to get the raw router without the default bearer token — for testing the auth surface itself */
  authenticated?: boolean;
}

Logger.attachTransport('file:json');
const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';

export const TEST_REGEX = {
  id: /^\d+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  dateISO: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
} satisfies Record<string, RegExp>;

export class TestEnvironment {
  private static readonly logger = Logger.getLogger(APP_NAME, TestEnvironment.name);
  private app!: ShadowApplication;
  private accessToken = '';

  constructor(private readonly databaseSuffix: string) {}

  init(): void {
    const databaseName = `${baseConnectionString.split('/').pop()}_${this.databaseSuffix}`;
    TestEnvironment.logger.info(`Setting up test environment with database: '${databaseName}'`);
    Config['cache'].set('database.postgres.url', `${baseConnectionString}_${this.databaseSuffix}`);
    // DatabaseService never closes its Postgres pool on app stop, so every booted TestEnvironment
    // leaks one for the rest of the run. Tests are sequential anyway; a small pool per app keeps the
    // whole suite far below Postgres's max_connections no matter how many suites boot an app.
    Config['cache'].set('database.postgres.max-connections', '3');

    // The shared StorageModule defaults to the S3 driver, which the suite has no cluster to reach; pin it
    // to the local-disk driver writing into a throwaway temp dir so image writes/reads stay hermetic.
    Config['cache'].set('storage.driver', 'local');
    Config['cache'].set('storage.local.dir', mkdtempSync(join(tmpdir(), 'nf-storage-')));
    Config['cache'].set('storage.public-origin', 'http://storage.test');

    // beforeAll runs before any beforeEach, so the database must exist before the app boots —
    // otherwise a fresh machine (no leftover DB from a prior run) fails the boot-time SELECT 1.
    // AppModule is imported lazily: the auth modules capture the issuer at import time, and with
    // the test IdP's top-level await in flight a static sibling import could evaluate them first.
    beforeAll(async () => {
      const { issueTestToken } = await import('./test-idp');
      this.accessToken = await issueTestToken();
      const { AppModule } = await import('@server/app.module');
      this.app = new ShadowApplication(AppModule);
      await createDatabaseFromTemplate(databaseName);
      await this.app.init();
    });
    beforeEach(() => createDatabaseFromTemplate(databaseName));
    afterAll(() => this.app.stop());
  }

  /**
   * Every API route requires an authenticated identity user, so the returned router injects the
   * shared test user's bearer token into each `mockRequest()` chain. A spec that sets its own
   * `.headers(...)` replaces the default (light-my-request `headers` assigns, not merges).
   */
  getRouter(options: GetRouterOptions = {}): FastifyRouter {
    const router = this.app.get(Dispatcher) as FastifyRouter;
    if (options.authenticated === false) return router;

    const accessToken = this.accessToken;
    return new Proxy(router, {
      get(target, property, receiver) {
        if (property !== 'mockRequest') return Reflect.get(target, property, receiver) as unknown;
        return () => target.mockRequest().headers({ authorization: `Bearer ${accessToken}` });
      },
    });
  }

  getPostgresClient(): PrimaryDatabase {
    const databaseService = this.app.get(DatabaseService);
    return databaseService.getPostgresClient();
  }

  getService<T>(token: Class<T> | AbstractClass<T>): T {
    return this.app.get(token);
  }
}
