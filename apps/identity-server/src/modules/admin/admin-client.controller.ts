/**
 * Importing npm packages
 */

import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { Auth, Context } from '@server/modules/access';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { AuditService } from '@server/modules/infrastructure/audit';
import { OAuthClient } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { AdminActor } from './admin-access.service';
import {
  ALLOWED_GRANT_TYPES,
  ClientDetailResponse,
  ClientIdParams,
  ClientListQuery,
  ClientListResponse,
  ClientScopeParams,
  GrantScopeBody,
  RegisterClientBody,
  RegisterClientResponse,
  RotateSecretResponse,
  UpdateClientBody,
} from './admin-client.dto';
import { AdminActionResponse } from './admin-user.dto';
import { ADMIN_PERMISSIONS } from './admin.constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/admin/clients')
@Auth({ permission: ADMIN_PERMISSIONS.clientsRead })
export class AdminClientController {
  constructor(
    private readonly clientService: OAuthClientService,
    private readonly applicationService: ApplicationService,
    private readonly auditService: AuditService,
  ) {}

  private async requireClient(clientId: string): Promise<OAuthClient> {
    const client = await this.clientService.getClient(clientId);
    if (!client) throw AppErrorCode.OAU_002.create();
    return client;
  }

  private async record(actor: AdminActor, action: string, clientId: string, detail?: Record<string, unknown>): Promise<void> {
    await this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.session.userId.toString(),
      targetType: 'oauth_client',
      targetId: clientId,
      detail: detail ?? null,
    });
  }

  @Get()
  @RespondFor(200, ClientListResponse)
  async listClients(@Query() query: ClientListQuery): Promise<ClientListResponse> {
    const clients = await this.clientService.listClients(query.applicationId);
    return {
      items: clients.map(client => ({
        id: client.id,
        name: client.name,
        kind: client.kind,
        isFirstParty: client.isFirstParty,
        isActive: client.isActive,
        applicationId: client.applicationId,
      })),
    };
  }

  @Post()
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(201, RegisterClientResponse)
  async registerClient(@Body() body: RegisterClientBody): Promise<RegisterClientResponse> {
    const actor = Context.getActor();
    if (body.grantTypes.some(grant => !ALLOWED_GRANT_TYPES.includes(grant as (typeof ALLOWED_GRANT_TYPES)[number]))) throw AppErrorCode.ADM_003.create();
    this.applicationService.getApplicationByIdOrThrow(body.applicationId);

    const registered = await this.clientService.register({
      id: body.clientId,
      applicationId: body.applicationId,
      name: body.name,
      kind: body.kind,
      isFirstParty: body.isFirstParty,
      redirectUris: body.redirectUris,
      grantTypes: body.grantTypes,
      accessTokenTtl: body.accessTokenTtl,
      backchannelLogoutUri: body.backchannelLogoutUri,
      workloadSubjects: body.workloadSubjects,
      authMethod: body.authMethod,
    });
    await this.record(actor, 'admin.client.registered', registered.clientId, { name: body.name, kind: body.kind });
    return { clientId: registered.clientId, secret: registered.secret };
  }

  @Get('/:clientId')
  @RespondFor(200, ClientDetailResponse)
  async getClientDetails(@Params() params: ClientIdParams): Promise<ClientDetailResponse> {
    const client = await this.clientService.getClientDetail(params.clientId);
    if (!client) throw AppErrorCode.OAU_002.create();
    return {
      id: client.id,
      name: client.name,
      kind: client.kind,
      isFirstParty: client.isFirstParty,
      isActive: client.isActive,
      applicationId: client.applicationId,
      redirectUris: client.redirectUris,
      scopes: client.scopes,
      grantTypes: client.grantTypes,
      accessTokenTtl: client.accessTokenTtl,
      authMethod: OAuthClientService.toAuthMethod(client.tokenEndpointAuthMethod),
      workloadSubjects: client.workloadSubjects ?? undefined,
      backchannelLogoutUri: client.backchannelLogoutUri ?? undefined,
      createdAt: client.createdAt.toISOString(),
    };
  }

  @Patch('/:clientId')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async updateClient(@Params() params: ClientIdParams, @Body() body: UpdateClientBody): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    await this.requireClient(params.clientId);
    await this.clientService.updateClient(params.clientId, {
      name: body.name,
      isActive: body.isActive,
      redirectUris: body.redirectUris,
      /** An empty string clears the back-channel logout URI; an empty array unbinds workload identity; undefined leaves each untouched. */
      backchannelLogoutUri: body.backchannelLogoutUri === '' ? null : body.backchannelLogoutUri,
      workloadSubjects: body.workloadSubjects,
    });
    await this.record(actor, 'admin.client.updated', params.clientId, { fields: Object.keys(body) });
    return { success: true };
  }

  @Delete('/:clientId')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async deleteClient(@Params() params: ClientIdParams): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    const client = await this.requireClient(params.clientId);
    await this.clientService.deleteClient(params.clientId);
    await this.record(actor, 'admin.client.deleted', params.clientId, { name: client.name, kind: client.kind });
    return { success: true };
  }

  @Post('/:clientId/rotate-secret')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, RotateSecretResponse)
  async rotateClientSecret(@Params() params: ClientIdParams): Promise<RotateSecretResponse> {
    const actor = Context.getActor();
    const client = await this.requireClient(params.clientId);
    if (client.tokenEndpointAuthMethod === 'none') throw AppErrorCode.ADM_003.create();
    const rotated = await this.clientService.rotateSecretWithOverlap(params.clientId);
    await this.record(actor, 'admin.client.secret_rotated', params.clientId);
    return { secret: rotated.secret, previousSecretsExpireAt: rotated.previousSecretsExpireAt.toISOString() };
  }

  @Post('/:clientId/scopes')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async grantClientScope(@Params() params: ClientIdParams, @Body() body: GrantScopeBody): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    await this.requireClient(params.clientId);
    await this.clientService.grantScope(params.clientId, body.scopeId);
    await this.record(actor, 'admin.client.scope_granted', params.clientId, { scopeId: body.scopeId });
    return { success: true };
  }

  @Delete('/:clientId/scopes/:scopeId')
  @Auth({ permission: ADMIN_PERMISSIONS.clientsManage, elevated: true })
  @RespondFor(200, AdminActionResponse)
  async revokeClientScope(@Params() params: ClientScopeParams): Promise<AdminActionResponse> {
    const actor = Context.getActor();
    await this.requireClient(params.clientId);
    await this.clientService.revokeScope(params.clientId, params.scopeId);
    await this.record(actor, 'admin.client.scope_revoked', params.clientId, { scopeId: params.scopeId });
    return { success: true };
  }
}
