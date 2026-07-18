/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach } from 'bun:test';

import { Dispatcher, ShadowApplication } from '@shadow-library/app';
import { createTestIdP, type TestIdP } from '@shadow-library/auth/testing';
import { Config, Logger } from '@shadow-library/common';
import { FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { PULSE_PERMISSIONS, PULSE_SCOPES } from '@modules/auth';
import { NotificationService } from '@modules/notification';
import { createDatabaseFromTemplate } from '@scripts/create-template-db';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';

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

/** Pulse's resource identifier (ecosystem-standard audience); every test token is minted for this audience so the guard accepts it */
export const TEST_AUDIENCE = 'pulse-server';
/** The single platform organisation operator permissions are evaluated in (pulse is single-tenant) */
export const TEST_ORG = '1';
/** The client id the identity server calls pulse with — the in-cluster M2M compatibility contract */
export const IDENTITY_CLIENT_ID = 'identity';
/** Generic allow-listed M2M caller used by business-logic specs */
export const TEST_SERVICE_CLIENT_ID = 'test-service';
const ADMIN_SUB = 'test-operator';

export const TEST_REGEX = {
  id: /^\d+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  dateISO: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
} satisfies Record<string, RegExp>;

export class TestEnvironment {
  private static readonly logger = Logger.getLogger(APP_NAME, TestEnvironment.name);

  private app: ShadowApplication;

  private idp: TestIdP;
  private adminHeaders: Record<string, string>;

  constructor(private readonly databaseSuffix: string) {}

  init(): void {
    const databaseName = `${baseConnectionString.split('/').pop()}_${this.databaseSuffix}`;
    TestEnvironment.logger.info(`Setting up test environment with database: '${databaseName}'`);
    Config['cache'].set('database.postgres.url', `${baseConnectionString}_${this.databaseSuffix}`);

    /** The developer's `.env` `APP_DEV_DELAY` throttle must not leak into tests: it adds seconds per request and trips bun's 5s per-test timeout */
    Config['cache'].set('app.dev.delay', 0);

    NotificationService.prototype['executeNotificationJob'] = () => Bun.sleep(10);

    beforeEach(() => createDatabaseFromTemplate(databaseName));

    /**
     * An in-process mock identity provider stands in for the real platform: it serves discovery,
     * JWKS, the token endpoint, the PDP, and the service-access rules so the SDK auth guard
     * exercises its real verification and authorization paths. Its config is injected — and the
     * M2M service-access rules configured — before `AppModule` is imported, because the SDK's
     * `AuthModule.forRoot` snapshots the auth config when the module graph is loaded.
     */
    beforeAll(async () => {
      this.idp = await createTestIdP();
      this.idp.setServiceAccess([
        /** The production contract: identity calls the notification send endpoint in-cluster */
        { callerClientId: IDENTITY_CLIENT_ID, method: 'POST', path: '/api/v1/notifications' },
        /** Blanket allowance for the generic test caller so business-logic specs stay focused */
        { callerClientId: TEST_SERVICE_CLIENT_ID, method: '*', path: '/api/v1/*' },
      ]);
      Config['cache'].set('auth.issuer', this.idp.issuer);
      Config['cache'].set('auth.audience', TEST_AUDIENCE);
      Config['cache'].set('auth.client.id', 'pulse');
      Config['cache'].set('auth.client.secret', 'test-secret');
      Config['cache'].set('auth.identity-resource', 'shadow-identity');

      const { AppModule } = await import('@server/app.module');
      this.app = new ShadowApplication(AppModule);
      await this.app.init();

      this.adminHeaders = await this.userHeaders({ sub: ADMIN_SUB, permissions: Object.values(PULSE_PERMISSIONS), scopes: [PULSE_SCOPES.notificationsSend] });
    });
    afterAll(async () => {
      await this.app.stop();
      this.idp.stop();
    });
  }

  getRouter(): FastifyRouter {
    return this.app.get(Dispatcher) as FastifyRouter;
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
    const clientId = options.clientId ?? TEST_SERVICE_CLIENT_ID;
    const token = await this.idp.issueToken({ sub: clientId, kind: 'service', clientId, audience: TEST_AUDIENCE, scopes: [...(options.scopes ?? [])] });
    return { authorization: `Bearer ${token}` };
  }

  /** Exposes the mock IdP for advanced cases (expired tokens, key rotation, custom claims) */
  getIdP(): TestIdP {
    return this.idp;
  }
}
