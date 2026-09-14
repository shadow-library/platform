import { alias } from 'drizzle-orm/pg-core';
import { and, asc, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

import { APP_NAME } from '@server/constants';
import { DatabaseService, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/modules/infrastructure/datastore';
import { OUTBOUND_SERVICE_CLIENT_NAME } from '@server/modules/infrastructure/service-token';

import { BOT_MANAGE_SCOPE_SUFFIX } from './bot-ownership.constants';
import { type BotAwareApplication } from './bot-ownership.types';

@Injectable()
export class BotApplicationService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * Read per call rather than cached: an application can be seeded long after boot, and an outbox
   * enqueued against a stale list would leave those records owned by a bot that no longer exists.
   * Pass the enqueueing transaction so an application registered in the gap cannot be missed.
   */
  listBotAware(executor: PrimaryDatabase | PrimaryTransaction = this.db): Promise<BotAwareApplication[]> {
    const clientOwner = alias(schema.applications, 'client_owner');
    const ownScope = sql`${schema.applications.name} || ${BOT_MANAGE_SCOPE_SUFFIX}`;

    return executor
      .select({
        id: schema.applications.id,
        name: schema.applications.name,
        displayName: schema.applications.displayName,
        logoUrl: schema.applications.logoUrl,
        audience: schema.apiResources.identifier,
        scope: schema.scopes.name,
      })
      .from(schema.oauthClientScopeGrants)
      .innerJoin(schema.oauthClients, eq(schema.oauthClients.id, schema.oauthClientScopeGrants.clientId))
      .innerJoin(clientOwner, eq(clientOwner.id, schema.oauthClients.applicationId))
      .innerJoin(schema.scopes, eq(schema.scopes.id, schema.oauthClientScopeGrants.scopeId))
      .innerJoin(schema.apiResources, eq(schema.apiResources.id, schema.scopes.apiResourceId))
      .innerJoin(schema.applications, eq(schema.applications.id, schema.apiResources.applicationId))
      .where(
        and(
          eq(clientOwner.name, APP_NAME),
          eq(schema.oauthClients.name, OUTBOUND_SERVICE_CLIENT_NAME),
          eq(schema.oauthClients.kind, 'SERVICE'),
          eq(schema.oauthClients.isActive, true),
          eq(schema.applications.isActive, true),
          eq(schema.apiResources.isActive, true),
          eq(schema.scopes.name, ownScope),
        ),
      )
      .orderBy(asc(schema.applications.name));
  }
}
