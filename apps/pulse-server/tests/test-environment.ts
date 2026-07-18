/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach } from 'bun:test';

import { Router, ShadowApplication } from '@shadow-library/app';
import { type TestIdP, createTestIdP } from '@shadow-library/auth/testing';
import { Config, Logger } from '@shadow-library/common';
import { FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { PULSE_PERMISSIONS, PULSE_SCOPES } from '@modules/auth';
import { NotificationService } from '@modules/notification';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { AppModule } from '@server/app.module';
import { APP_NAME } from '@server/constants';
import { PrimaryDatabase } from '@server/database';

/**
 * Defining types
 */

export interface UserTokenOptions {
  sub: string;
  organisationId?: string;
  permissions?: readonly string[];
  scopes?: readonly string[];
}

export interface ServiceTokenOptions {
  clientId?: string;
  scopes?: readonly string[];
}

/**
 * Declaring the constants
 */
Logger.attachTransport('file:json');
const baseConnectionString = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost/shadow_pulse';

/** Pulse's resource identifier; every test token is minted for this audience so the guard accepts it */
export const TEST_AUDIENCE = 'shadow-pulse';
/** The single platform organisation operator permissions are evaluated in (pulse is single-tenant) */
export const TEST_ORG = '1';
const ADMIN_SUB = 'test-operator';

export const TEST_REGEX = {
  id: /^\d+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  dateISO: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
} satisfies Record<string, RegExp>;

export class TestEnvironment {
  private static readonly logger = Logger.getLogger(APP_NAME, TestEnvironment.name);

  private readonly app = new ShadowApplication(AppModule);

  private idp: TestIdP;
  private adminHeaders: Record<string, string>;

  constructor(private readonly databaseSuffix: string) {}

  init(): void {
    const databaseName = `${baseConnectionString.split('/').pop()}_${this.databaseSuffix}`;
    TestEnvironment.logger.info(`Setting up test environment with database: '${databaseName}'`);
    Config['cache'].set('database.postgres.url', `${baseConnectionString}_${this.databaseSuffix}`);

    NotificationService.prototype['executeNotificationJob'] = () => Bun.sleep(10);

    beforeEach(() => createDatabaseFromTemplate(databaseName));

    /**
     * An in-process mock identity provider stands in for the real platform: it serves discovery,
     * JWKS, the token endpoint and the PDP so the auth guard exercises its real verification and
     * authorization paths. Its config is injected before `app.init()` so the deferred auth-client
     * factory reads this issuer rather than a default.
     */
    beforeAll(async () => {
      this.idp = await createTestIdP();
      Config['cache'].set('auth.issuer', this.idp.issuer);
      Config['cache'].set('auth.audience', TEST_AUDIENCE);
      Config['cache'].set('auth.client-id', 'pulse');
      Config['cache'].set('auth.client-secret', 'test-secret');
      Config['cache'].set('auth.identity-resource', 'shadow-identity');
      await this.app.init();

      this.adminHeaders = await this.userHeaders({ sub: ADMIN_SUB, permissions: Object.values(PULSE_PERMISSIONS), scopes: [PULSE_SCOPES.notificationsSend] });
    });
    afterAll(async () => {
      await this.app.stop();
      this.idp.stop();
    });
  }

  getRouter(): FastifyRouter {
    return this.app.get(Router);
  }

  getPostgresClient(): PrimaryDatabase {
    const databaseService = this.app.get(DatabaseService);
    return databaseService.getPostgresClient();
  }

  /** Header for an operator granted every pulse permission and the send scope; the default for business-logic specs */
  authHeaders(): Record<string, string> {
    return this.adminHeaders;
  }

  /** Mints a user bearer with an explicit permission/scope set, granting the permissions in the PDP for that principal */
  async userHeaders(options: UserTokenOptions): Promise<Record<string, string>> {
    const organisationId = options.organisationId ?? TEST_ORG;
    for (const action of options.permissions ?? []) this.idp.grantPermission({ kind: 'user', sub: options.sub }, organisationId, action);
    const token = await this.idp.issueToken({ sub: options.sub, org: organisationId, audience: TEST_AUDIENCE, scopes: [...(options.scopes ?? [])] });
    return { authorization: `Bearer ${token}` };
  }

  /** Mints a machine-to-machine bearer carrying the given scopes and no organisation */
  async serviceHeaders(options: ServiceTokenOptions = {}): Promise<Record<string, string>> {
    const clientId = options.clientId ?? 'test-service';
    const token = await this.idp.issueToken({ sub: clientId, kind: 'service', clientId, audience: TEST_AUDIENCE, scopes: [...(options.scopes ?? [])] });
    return { authorization: `Bearer ${token}` };
  }

  /** Exposes the mock IdP for advanced cases (expired tokens, key rotation, custom claims) */
  getIdP(): TestIdP {
    return this.idp;
  }
}
