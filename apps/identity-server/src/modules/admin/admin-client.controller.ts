/**
 * Importing npm packages
 */

import { type FastifyRequest } from 'fastify';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { OAuthClientService } from '@server/modules/auth/oauth';
import { AuditService } from '@server/modules/infrastructure/audit';
import { OAuthClient } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { AdminAccessService, AdminActor } from './admin-access.service';
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
export class AdminClientController {
  constructor(
    private readonly access: AdminAccessService,
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
  async list(@Query() query: ClientListQuery, @Req() request: FastifyRequest): Promise<ClientListResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.clientsRead);
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
  @RespondFor(201, RegisterClientResponse)
  async register(@Body() body: RegisterClientBody, @Req() request: FastifyRequest): Promise<RegisterClientResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    if (body.grantTypes.some(grant => !ALLOWED_GRANT_TYPES.includes(grant as (typeof ALLOWED_GRANT_TYPES)[number]))) throw AppErrorCode.ADM_003.create();
    this.applicationService.getApplicationByIdOrThrow(body.applicationId);

    const registered = await this.clientService.register({
      applicationId: body.applicationId,
      name: body.name,
      kind: body.kind,
      isFirstParty: body.isFirstParty,
      redirectUris: body.redirectUris,
      grantTypes: body.grantTypes,
      accessTokenTtl: body.accessTokenTtl,
      backchannelLogoutUri: body.backchannelLogoutUri,
      workloadSubject: body.workloadSubject,
      authMethod: body.authMethod,
    });
    await this.record(actor, 'admin.client.registered', registered.clientId, { name: body.name, kind: body.kind });
    return { clientId: registered.clientId, secret: registered.secret };
  }

  @Get('/:clientId')
  @RespondFor(200, ClientDetailResponse)
  async detail(@Params() params: ClientIdParams, @Req() request: FastifyRequest): Promise<ClientDetailResponse> {
    await this.access.requireRead(request, ADMIN_PERMISSIONS.clientsRead);
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
      workloadSubject: client.workloadSubject ?? undefined,
      createdAt: client.createdAt.toISOString(),
    };
  }

  @Patch('/:clientId')
  @RespondFor(200, AdminActionResponse)
  async update(@Params() params: ClientIdParams, @Body() body: UpdateClientBody, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    await this.requireClient(params.clientId);
    await this.clientService.updateClient(params.clientId, {
      name: body.name,
      isActive: body.isActive,
      redirectUris: body.redirectUris,
      backchannelLogoutUri: body.backchannelLogoutUri,
      /** An empty string unbinds the workload subject; undefined leaves it untouched */
      workloadSubject: body.workloadSubject === '' ? null : body.workloadSubject,
    });
    await this.record(actor, 'admin.client.updated', params.clientId, { fields: Object.keys(body) });
    return { success: true };
  }

  @Post('/:clientId/rotate-secret')
  @HttpStatus(200)
  @RespondFor(200, RotateSecretResponse)
  async rotateSecret(@Params() params: ClientIdParams, @Req() request: FastifyRequest): Promise<RotateSecretResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    const client = await this.requireClient(params.clientId);
    if (client.tokenEndpointAuthMethod === 'none') throw AppErrorCode.ADM_003.create();
    const rotated = await this.clientService.rotateSecretWithOverlap(params.clientId);
    await this.record(actor, 'admin.client.secret_rotated', params.clientId);
    return { secret: rotated.secret, previousSecretsExpireAt: rotated.previousSecretsExpireAt.toISOString() };
  }

  @Post('/:clientId/scopes')
  @HttpStatus(200)
  @RespondFor(200, AdminActionResponse)
  async grantScope(@Params() params: ClientIdParams, @Body() body: GrantScopeBody, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    await this.requireClient(params.clientId);
    await this.clientService.grantScope(params.clientId, body.scopeId);
    await this.record(actor, 'admin.client.scope_granted', params.clientId, { scopeId: body.scopeId });
    return { success: true };
  }

  @Delete('/:clientId/scopes/:scopeId')
  @RespondFor(200, AdminActionResponse)
  async revokeScope(@Params() params: ClientScopeParams, @Req() request: FastifyRequest): Promise<AdminActionResponse> {
    const actor = await this.access.requireMutation(request, ADMIN_PERMISSIONS.clientsManage);
    await this.requireClient(params.clientId);
    await this.clientService.revokeScope(params.clientId, params.scopeId);
    await this.record(actor, 'admin.client.scope_revoked', params.clientId, { scopeId: params.scopeId });
    return { success: true };
  }
}
