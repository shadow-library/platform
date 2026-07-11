/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, Params, Patch, Post, Req, RespondFor } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { SamlService } from '@server/modules/auth/saml';
import { AuditService } from '@server/modules/infrastructure/audit';
import { SamlServiceProvider } from '@server/modules/infrastructure/datastore';

import { AdminAccessService, AdminActor } from './admin-access.service';
import { CreateServiceProviderBody, ServiceProviderIdParams, ServiceProviderItem, ServiceProviderListResponse, UpdateServiceProviderBody } from './admin-saml.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * SAML service providers are platform-tier integrations, administered under the same permission as
 * OAuth clients (`iam:clients:manage`) — both registries decide where this IdP will assert
 * identities to, so they share an owner.
 */

@HttpController('/api/v1/admin/saml/service-providers')
export class AdminSamlController {
  constructor(
    private readonly access: AdminAccessService,
    private readonly samlService: SamlService,
    private readonly auditService: AuditService,
  ) {}

  private toItem(serviceProvider: SamlServiceProvider): ServiceProviderItem {
    return {
      id: serviceProvider.id,
      entityId: serviceProvider.entityId,
      name: serviceProvider.name,
      acsUrl: serviceProvider.acsUrl,
      nameIdFormat: serviceProvider.nameIdFormat,
      releasedAttributes: serviceProvider.releasedAttributes,
      isActive: serviceProvider.isActive,
      createdAt: serviceProvider.createdAt.toISOString(),
    };
  }

  private async record(actor: AdminActor, action: string, serviceProviderId: string): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.session.userId.toString(),
      targetType: 'saml_service_provider',
      targetId: serviceProviderId,
    });
  }

  @Get()
  @RespondFor(200, ServiceProviderListResponse)
  async list(@Req() request: FastifyRequest): Promise<ServiceProviderListResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.clientsRead);
    const serviceProviders = await this.samlService.listServiceProviders();
    return { items: serviceProviders.map(serviceProvider => this.toItem(serviceProvider)) };
  }

  @Post()
  @RespondFor(201, ServiceProviderItem)
  async create(@Body() body: CreateServiceProviderBody, @Req() request: FastifyRequest): Promise<ServiceProviderItem> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    const serviceProvider = await this.samlService.createServiceProvider(body);
    await this.record(actor, 'saml.sp.created', serviceProvider.id);
    return this.toItem(serviceProvider);
  }

  @Get('/:serviceProviderId')
  @RespondFor(200, ServiceProviderItem)
  async get(@Params() params: ServiceProviderIdParams, @Req() request: FastifyRequest): Promise<ServiceProviderItem> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.clientsRead);
    return this.toItem(await this.samlService.getServiceProvider(params.serviceProviderId));
  }

  @Patch('/:serviceProviderId')
  @RespondFor(200, ServiceProviderItem)
  async update(@Params() params: ServiceProviderIdParams, @Body() body: UpdateServiceProviderBody, @Req() request: FastifyRequest): Promise<ServiceProviderItem> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    const serviceProvider = await this.samlService.updateServiceProvider(params.serviceProviderId, body);
    await this.record(actor, 'saml.sp.updated', params.serviceProviderId);
    return this.toItem(serviceProvider);
  }

  @Delete('/:serviceProviderId')
  @RespondFor(200, AdminActionResponse)
  async remove(@Params() params: ServiceProviderIdParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    await this.samlService.removeServiceProvider(params.serviceProviderId);
    await this.record(actor, 'saml.sp.deleted', params.serviceProviderId);
    return { success: true };
  }
}
