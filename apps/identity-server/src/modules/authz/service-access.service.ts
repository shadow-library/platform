/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, ServiceRouteAccess, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface CreateServiceAccessRule {
  applicationId: number;
  callerClientId: string;
  method: string;
  pathPattern: string;
  createdBy?: string;
}

/**
 * Declaring the constants
 *
 * The admin-managed M2M route allowlist (D-17). Admins configure which caller client may invoke
 * which routes of a target application; each consuming service loads its own application's rules
 * at startup through the SDK and enforces them locally, deny-by-default. Route code never names
 * callers, and granting a new caller is an admin operation instead of a redeploy.
 */
const ALLOWED_METHODS = new Set(['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const UUID_PATTERN = /^[0-9a-fA-F-]{36}$/;

@Injectable()
export class ServiceAccessService {
  private readonly logger = Logger.getLogger(APP_NAME, ServiceAccessService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /** Rules a service enforces for its own routes, resolved from the caller's client id */
  async listForClient(clientId: string): Promise<ServiceRouteAccess[]> {
    if (!UUID_PATTERN.test(clientId)) throw AppErrorCode.AUTHZ_002.create();
    const client = await this.db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, clientId), columns: { applicationId: true } });
    if (!client) throw AppErrorCode.AUTHZ_002.create();
    return this.listForApplication(client.applicationId);
  }

  listForApplication(applicationId: number): Promise<ServiceRouteAccess[]> {
    return this.db.query.serviceRouteAccess.findMany({ where: eq(schema.serviceRouteAccess.applicationId, applicationId) });
  }

  async create(input: CreateServiceAccessRule): Promise<ServiceRouteAccess> {
    const method = input.method.toUpperCase();
    if (!ALLOWED_METHODS.has(method)) throw AppErrorCode.AUTHZ_003.create();
    if (!input.pathPattern.startsWith('/')) throw AppErrorCode.AUTHZ_003.create();

    const caller = await this.db.query.oauthClients.findFirst({ where: eq(schema.oauthClients.id, input.callerClientId), columns: { id: true } });
    if (!caller) throw AppErrorCode.AUTHZ_003.create();

    const [rule] = await this.db
      .insert(schema.serviceRouteAccess)
      .values({ applicationId: input.applicationId, callerClientId: input.callerClientId, method, pathPattern: input.pathPattern, createdBy: input.createdBy ?? null })
      .onConflictDoNothing()
      .returning();
    if (!rule) return this.getExisting(input, method);

    this.logger.info('service access rule created', { applicationId: input.applicationId, callerClientId: input.callerClientId, method, pathPattern: input.pathPattern });
    return rule;
  }

  async delete(id: string): Promise<boolean> {
    if (!UUID_PATTERN.test(id)) return false;
    const deleted = await this.db.delete(schema.serviceRouteAccess).where(eq(schema.serviceRouteAccess.id, id)).returning({ id: schema.serviceRouteAccess.id });
    if (deleted.length > 0) this.logger.info('service access rule deleted', { ruleId: id });
    return deleted.length > 0;
  }

  /** Idempotent create: a conflict means the identical rule already exists, so return it */
  private async getExisting(input: CreateServiceAccessRule, method: string): Promise<ServiceRouteAccess> {
    const rules = await this.listForApplication(input.applicationId);
    const existing = rules.find(rule => rule.callerClientId === input.callerClientId && rule.method === method && rule.pathPattern === input.pathPattern);
    if (!existing) throw AppErrorCode.AUTHZ_003.create();
    return existing;
  }
}
