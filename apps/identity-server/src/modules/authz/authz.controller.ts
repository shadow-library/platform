/**
 * Importing npm packages
 */

import { type FastifyRequest } from 'fastify';
import { Body, Get, HttpController, Post, Put, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

import { CatalogSyncBody, CatalogSyncResponse, CheckRequestBody, CheckResponse, ServiceAccessResponse } from './authz.dto';
import { CatalogSyncService } from './catalog-sync.service';
import { PolicyDecisionService } from './policy-decision.service';
import { ServiceAccessService } from './service-access.service';
import { getServiceTokenClaims, RequireServiceToken, type ServiceTokenCarrier } from './service-token.guard';

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
    private readonly serviceAccessService: ServiceAccessService,
  ) {}

  /** Extracts the caller's client id from the verified service-token claims */
  private callerClientId(request: FastifyRequest): string {
    const claims = getServiceTokenClaims(request as FastifyRequest & ServiceTokenCarrier);
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : typeof claims.sub === 'string' ? claims.sub : '';
    if (!clientId) throw AppErrorCode.AUTHZ_002.create();
    return clientId;
  }

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
    return this.catalogSyncService.sync(this.callerClientId(request), { permissions: body.permissions, roles: body.roles });
  }

  /** A service fetches the admin-configured M2M allowlist for its own routes; the application is derived from the caller's token (D-17). */
  @Get('/service-access')
  @RequireServiceToken('authz:check')
  @RespondFor(200, ServiceAccessResponse)
  async serviceAccess(@Req() request: FastifyRequest): Promise<ServiceAccessResponse> {
    const rules = await this.serviceAccessService.listForClient(this.callerClientId(request));
    return { rules: rules.map(rule => ({ callerClientId: rule.callerClientId, method: rule.method, path: rule.pathPattern })) };
  }
}
