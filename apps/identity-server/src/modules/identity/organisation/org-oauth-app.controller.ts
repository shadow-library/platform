import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';

import {
  GrantOrgOAuthAppScopeBody,
  OrgOAuthAppDetailResponse,
  OrgOAuthAppParams,
  OrgOAuthAppScopeCatalogResponse,
  OrgOAuthAppScopeParams,
  OrgOAuthAppsResponse,
  RegisterOrgOAuthAppBody,
  RegisterOrgOAuthAppResponse,
  RotateOrgOAuthAppSecretResponse,
  UpdateOrgOAuthAppBody,
} from './org-oauth-app.dto';
import {
  type OrgOAuthAppActor,
  type OrgOAuthAppDetail,
  type OrgOAuthAppScope,
  OrgOAuthAppService,
  type OrgOAuthAppSummary,
  type RegisteredOrgOAuthApp,
} from './org-oauth-app.service';
import { OrganisationActionResponse, OrganisationIdParams } from './organisation.dto';

@HttpController('/api/v1/organisations/:organisationId/oauth-apps')
@Auth({ orgRole: 'ADMIN' })
export class OrgOAuthAppController {
  constructor(private readonly orgOAuthAppService: OrgOAuthAppService) {}

  private actor(): OrgOAuthAppActor {
    return { actorId: Context.getSession().userId.toString(), ip: Context.getClientInfo().ip };
  }

  @Get()
  @RespondFor(200, OrgOAuthAppsResponse)
  async listApps(@Params() params: OrganisationIdParams): Promise<{ apps: OrgOAuthAppSummary[] }> {
    return { apps: await this.orgOAuthAppService.listApps(params.organisationId) };
  }

  @Post()
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @HttpStatus(201)
  @RespondFor(201, RegisterOrgOAuthAppResponse)
  registerApp(@Params() params: OrganisationIdParams, @Body() body: RegisterOrgOAuthAppBody): Promise<RegisteredOrgOAuthApp> {
    return this.orgOAuthAppService.registerApp(this.actor(), params.organisationId, body);
  }

  @Get('/scope-catalog')
  @RespondFor(200, OrgOAuthAppScopeCatalogResponse)
  async listScopeCatalog(@Params() params: OrganisationIdParams): Promise<{ scopes: OrgOAuthAppScope[] }> {
    return { scopes: await this.orgOAuthAppService.listScopeCatalog(params.organisationId) };
  }

  @Get('/:applicationId')
  @RespondFor(200, OrgOAuthAppDetailResponse)
  getApp(@Params() params: OrgOAuthAppParams): Promise<OrgOAuthAppDetail> {
    return this.orgOAuthAppService.getApp(params.organisationId, params.applicationId);
  }

  @Patch('/:applicationId')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, OrganisationActionResponse)
  async updateApp(@Params() params: OrgOAuthAppParams, @Body() body: UpdateOrgOAuthAppBody): Promise<OrganisationActionResponse> {
    await this.orgOAuthAppService.updateApp(this.actor(), params.organisationId, params.applicationId, body);
    return { success: true };
  }

  @Delete('/:applicationId')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, OrganisationActionResponse)
  async deleteApp(@Params() params: OrgOAuthAppParams): Promise<OrganisationActionResponse> {
    await this.orgOAuthAppService.deleteApp(this.actor(), params.organisationId, params.applicationId);
    return { success: true };
  }

  @Post('/:applicationId/rotate-secret')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @HttpStatus(200)
  @RespondFor(200, RotateOrgOAuthAppSecretResponse)
  rotateSecret(@Params() params: OrgOAuthAppParams): Promise<{ secret: string; previousSecretsExpireAt: Date }> {
    return this.orgOAuthAppService.rotateSecret(this.actor(), params.organisationId, params.applicationId);
  }

  @Post('/:applicationId/scopes')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @HttpStatus(200)
  @RespondFor(200, OrganisationActionResponse)
  async grantScope(@Params() params: OrgOAuthAppParams, @Body() body: GrantOrgOAuthAppScopeBody): Promise<OrganisationActionResponse> {
    await this.orgOAuthAppService.grantScope(this.actor(), params.organisationId, params.applicationId, body.scopeId);
    return { success: true };
  }

  @Delete('/:applicationId/scopes/:scopeId')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, OrganisationActionResponse)
  async revokeScope(@Params() params: OrgOAuthAppScopeParams): Promise<OrganisationActionResponse> {
    await this.orgOAuthAppService.revokeScope(this.actor(), params.organisationId, params.applicationId, params.scopeId);
    return { success: true };
  }
}
