/**
 * Importing npm packages
 */
import { Body, HttpController, Post, Put, Req, RespondFor, ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { CatalogSyncBody, CatalogSyncResponse, CheckRequestBody, CheckResponse } from './authz.dto';
import { CatalogSyncService } from './catalog-sync.service';
import { PolicyDecisionService } from './policy-decision.service';
import { RequireServiceToken, type ServiceTokenCarrier, getServiceTokenClaims } from './service-token.guard';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/authz')
export class AuthzController {
  constructor(
    private readonly pdp: PolicyDecisionService,
    private readonly catalogSyncService: CatalogSyncService,
  ) {}

  @Post('/check')
  @RequireServiceToken('authz:check')
  @RespondFor(200, CheckResponse)
  check(@Body() body: CheckRequestBody): Promise<CheckResponse> {
    return this.pdp.check({ principal: { type: body.principalType, id: body.principalId }, organisationId: body.organisationId, action: body.action });
  }

  /** A service declaratively replaces its own application's role catalog; the target application is derived from the caller's token, never the body. */
  @Put('/catalog')
  @RequireServiceToken('authz:roles:sync')
  @RespondFor(200, CatalogSyncResponse)
  async syncCatalog(@Body() body: CatalogSyncBody, @Req() request: FastifyRequest): Promise<CatalogSyncResponse> {
    const claims = getServiceTokenClaims(request as FastifyRequest & ServiceTokenCarrier);
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : typeof claims.sub === 'string' ? claims.sub : '';
    if (!clientId) throw new ServerError(AppErrorCode.AUTHZ_002);
    return this.catalogSyncService.sync(clientId, { permissions: body.permissions, roles: body.roles });
  }
}
