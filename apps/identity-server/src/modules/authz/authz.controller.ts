/**
 * Importing npm packages
 */

import { Body, Get, HttpController, Post, Put, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context, serviceClientId } from '@server/modules/access';

import { CatalogSyncBody, CatalogSyncResponse, CheckRequestBody, CheckResponse, ServiceAccessResponse } from './authz.dto';
import { CatalogSyncService } from './catalog-sync.service';
import { PolicyDecisionService } from './policy-decision.service';
import { ServiceAccessService } from './service-access.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/authz')
@Auth({ service: 'authz:check' })
export class AuthzController {
  constructor(
    private readonly pdp: PolicyDecisionService,
    private readonly catalogSyncService: CatalogSyncService,
    private readonly serviceAccessService: ServiceAccessService,
  ) {}

  @Post('/check')
  @RespondFor(200, CheckResponse)
  checkAccess(@Body() body: CheckRequestBody): Promise<CheckResponse> {
    return this.pdp.check({ principal: { type: body.principalType, id: body.principalId }, organisationId: body.organisationId, action: body.action });
  }

  /** A service declaratively replaces its own application's role catalog; the target application is derived from the caller's token, never the body. */
  @Put('/catalog')
  @Auth({ service: 'authz:roles:sync' })
  @RespondFor(200, CatalogSyncResponse)
  syncCatalog(@Body() body: CatalogSyncBody): Promise<CatalogSyncResponse> {
    return this.catalogSyncService.sync(serviceClientId(Context.getServiceToken()), { permissions: body.permissions, roles: body.roles });
  }

  /** A service fetches the admin-configured M2M allowlist for its own routes; the application is derived from the caller's token (D-17). */
  @Get('/service-access')
  @RespondFor(200, ServiceAccessResponse)
  async listServiceAccess(): Promise<ServiceAccessResponse> {
    const rules = await this.serviceAccessService.listForClient(serviceClientId(Context.getServiceToken()));
    return { rules: rules.map(rule => ({ callerClientId: rule.callerClientId, method: rule.method, path: rule.pathPattern })) };
  }
}
