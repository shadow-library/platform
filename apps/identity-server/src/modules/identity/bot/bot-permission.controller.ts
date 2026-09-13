import { Body, Get, HttpController, Params, Put, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';
import { OrganisationActionResponse, OrganisationIdParams } from '@server/modules/identity/organisation/organisation.dto';

import { type BotCatalogApplication, type BotGrant, BotPermissionService } from './bot-permission.service';
import { BotParams, BotPermissionCatalogResponse, BotPermissionsResponse, ReplaceBotPermissionsBody } from './bot.dto';
import { type BotActor } from './bot.types';

@HttpController('/api/v1/organisations/:organisationId')
@Auth({ orgRole: 'ADMIN' })
export class BotPermissionController {
  constructor(private readonly botPermissionService: BotPermissionService) {}

  private actor(): BotActor {
    return { userId: Context.getSession().userId, ip: Context.getClientInfo().ip };
  }

  @Get('/bot-permission-catalog')
  @RespondFor(200, BotPermissionCatalogResponse)
  async listCatalog(@Params() params: OrganisationIdParams): Promise<{ applications: BotCatalogApplication[] }> {
    return { applications: await this.botPermissionService.listCatalog(params.organisationId, Context.getSession().userId) };
  }

  @Get('/bots/:botId/permissions')
  @RespondFor(200, BotPermissionsResponse)
  async listPermissions(@Params() params: BotParams): Promise<{ grants: BotGrant[] }> {
    return { grants: await this.botPermissionService.listGrants(params.organisationId, params.botId) };
  }

  @Put('/bots/:botId/permissions')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, OrganisationActionResponse)
  async replacePermissions(@Params() params: BotParams, @Body() body: ReplaceBotPermissionsBody): Promise<OrganisationActionResponse> {
    await this.botPermissionService.replaceGrants(this.actor(), params.organisationId, params.botId, body.grants);
    return { success: true };
  }
}
