/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Params, Post, Req, RespondFor } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { OAuthClientService } from '@server/modules/auth/oauth';
import { AuditService } from '@server/modules/infrastructure/audit';
import { ApplicationService } from '@server/modules/system/application';

import { AdminAccessService } from './admin-access.service';
import { CreateResourceBody, CreateScopeBody, CreatedResponse, ResourceIdParams, ResourceListResponse } from './admin-client.dto';
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
    private readonly access: AdminAccessService,
    private readonly clientService: OAuthClientService,
    private readonly applicationService: ApplicationService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RespondFor(200, ResourceListResponse)
  async list(@Req() request: FastifyRequest): Promise<ResourceListResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.clientsRead);
    const resources = await this.clientService.listResources();
    return {
      items: resources.map(resource => ({
        id: resource.id,
        identifier: resource.identifier,
        displayName: resource.displayName ?? undefined,
        applicationId: resource.applicationId,
        scopes: resource.scopes.map(scope => ({ id: scope.id, name: scope.name, description: scope.description ?? undefined, isSensitive: scope.isSensitive })),
      })),
    };
  }

  @Post()
  @RespondFor(201, CreatedResponse)
  async create(@Body() body: CreateResourceBody, @Req() request: FastifyRequest): Promise<CreatedResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
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
  @RespondFor(201, CreatedResponse)
  async createScope(@Params() params: ResourceIdParams, @Body() body: CreateScopeBody, @Req() request: FastifyRequest): Promise<CreatedResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    const scopeId = await this.clientService.createScope(params.resourceId, body.name, body.description, body.isSensitive);
    await this.auditService.record({
      action: 'admin.scope.created',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.session.userId.toString(),
      targetType: 'scope',
      targetId: scopeId,
      detail: { name: body.name, isSensitive: body.isSensitive ?? false },
    });
    return { id: scopeId };
  }
}
