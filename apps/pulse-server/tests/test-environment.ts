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
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

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

/** Pulse's app id at identity; the SDK reads it from `AUTH_APP_ID` and it doubles as the OAuth client id */
export const TEST_APP_ID = 'pulse';
/** Pulse's API resource identifier; the mock's `apps/me` publishes it and the SDK derives it as the audience the guard accepts */
export const TEST_AUDIENCE = 'api://pulse';
/** The platform scopes an admin has granted the pulse client; the SDK's `apps/me` publishes exactly these */
export const TEST_GRANTED_SCOPES = ['authz:check', 'authz:roles:sync', 'app-session:manage'] as const;
/**
 * The single platform organisation operator permissions are evaluated in (pulse is single-tenant).
 *
 * Keep this as the *platform* organisation, not a personal workspace. Identity resolves an app
 * session's organisation from the ones that actually grant the application, and pulse is INTERNAL —
 * reachable only through the platform organisation. A fixture that minted a personal workspace here
 * would diverge from production and let this suite pass green over a console that answered every
 * request with a permission denial, which is exactly what happened before that resolution existed.
 */
export const TEST_ORG = '1';
/** The client id the identity server calls pulse with — the in-cluster M2M compatibility contract */
export const IDENTITY_CLIENT_ID = 'identity-server';
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
     * JWKS, the token endpoint, the PDP, the service-access rules, `GET /api/v1/apps/me`, and the
     * first-party app-session routes, so the SDK auth guard and browser flow exercise their real
     * paths. The mock publishes pulse's registration (app id `pulse`, audience `api://pulse`, the
     * granted platform scopes, and the callback redirect uri) from which the SDK derives everything
     * a deploy used to restate. Its config is injected — and the M2M service-access rules
     * configured — before `AppModule` is imported, because `AuthModule.forRoot` resolves the auth
     * config when the module graph is loaded.
     */
    beforeAll(async () => {
      this.idp = await createTestIdP({
        app: {
          appId: TEST_APP_ID,
          name: TEST_APP_ID,
          audience: TEST_AUDIENCE,
          redirectUris: ['http://localhost:8080/api/auth/callback'],
          scopes: [...TEST_GRANTED_SCOPES],
        },
      });
      this.idp.setServiceAccess([
        /** The production contract: identity calls the notification send endpoint in-cluster */
        { callerClientId: IDENTITY_CLIENT_ID, method: 'POST', path: '/api/v1/notifications' },
        /** Blanket allowance for the generic test caller so business-logic specs stay focused */
        { callerClientId: TEST_SERVICE_CLIENT_ID, method: '*', path: '/api/v1/*' },
      ]);
      Config['cache'].set('auth.issuer', this.idp.issuer);
      Config['cache'].set('auth.app-id', TEST_APP_ID);
      Config['cache'].set('auth.client.secret', 'test-secret');

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
