/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { AuditService } from '@server/modules/infrastructure/audit';
import { ApplicationService } from '@server/modules/system/application';

import { CreatedResponse, CreateResourceBody, CreateScopeBody, ResourceIdParams, ResourceListResponse } from './admin-client.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/admin/resources')
export class AdminResourceController {
  constructor(
    private readonly clientService: OAuthClientService,
    private readonly applicationService: ApplicationService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Auth({ permission: ADMIN_PERMISSIONS.clientsRead })
  @RespondFor(200, ResourceListResponse)
  async listResources(): Promise<ResourceListResponse> {
    const resources = await this.clientService.listResources();
    return {
      items: resources.map(resource => ({
        id: resource.id,
        identifier: resource.identifier,
        displayName: resource.displayName ?? undefined,
        applicationId: resource.applicationId,
        scopes: resource.scopes.map(scope => ({
          id: scope.id,
          name: scope.name,
          description: scope.description ?? undefined,
          isSensitive: scope.isSensitive,
          principalType: scope.principalType,
        })),
      })),
    };
  }

  @Post()
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(201, CreatedResponse)
  async createResource(@Body() body: CreateResourceBody): Promise<CreatedResponse> {
    const actor = Context.getActor();
    this.applicationService.getApplicationByIdOrThrow(body.applicationId);
    const resource = await this.clientService.ensureResource(body.applicationId, body.identifier, body.displayName);
    await this.auditService.record({
      action: 'admin.resource.created',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.session.userId.toString(),
      targetType: 'api_resource',
      targetId: resource.id,
    });
    return { id: resource.id };
  }

  @Post('/:resourceId/scopes')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(201, CreatedResponse)
  async createResourceScope(@Params() params: ResourceIdParams, @Body() body: CreateScopeBody): Promise<CreatedResponse> {
    const actor = Context.getActor();
    const scopeId = await this.clientService.createScope(params.resourceId, body.name, body.description, body.isSensitive, body.principalType);
    await this.auditService.record({
      action: 'admin.scope.created',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.session.userId.toString(),
      targetType: 'scope',
      targetId: scopeId,
      detail: { name: body.name, isSensitive: body.isSensitive ?? false, principalType: body.principalType ?? 'BOTH' },
    });
    return { id: scopeId };
  }
}
