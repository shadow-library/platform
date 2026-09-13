import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';
import { OrganisationActionResponse, OrganisationIdParams } from '@server/modules/identity/organisation/organisation.dto';

import { BotKeyService, type BotKeySummary, type CreatedBotKey } from './bot-key.service';
import { BotItem, BotKeyParams, BotKeysResponse, BotParams, BotsResponse, CreateBotBody, CreateBotKeyBody, CreatedBotKeyResponse, UpdateBotBody } from './bot.dto';
import { type BotActor, type BotListing, BotService, type BotSummary } from './bot.service';

@HttpController('/api/v1/organisations/:organisationId/bots')
@Auth({ orgRole: 'ADMIN' })
export class BotController {
  constructor(
    private readonly botService: BotService,
    private readonly botKeyService: BotKeyService,
  ) {}

  private actor(): BotActor {
    return { userId: Context.getSession().userId, ip: Context.getClientInfo().ip };
  }

  @Get()
  @RespondFor(200, BotsResponse)
  listBots(@Params() params: OrganisationIdParams): Promise<BotListing> {
    return this.botService.listBots(params.organisationId);
  }

  @Post()
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @HttpStatus(201)
  @RespondFor(201, BotItem)
  createBot(@Params() params: OrganisationIdParams, @Body() body: CreateBotBody): Promise<BotSummary> {
    return this.botService.createBot(this.actor(), params.organisationId, body);
  }

  @Get('/:botId')
  @RespondFor(200, BotItem)
  getBot(@Params() params: BotParams): Promise<BotSummary> {
    return this.botService.getBot(params.organisationId, params.botId);
  }

  @Patch('/:botId')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, OrganisationActionResponse)
  async updateBot(@Params() params: BotParams, @Body() body: UpdateBotBody): Promise<OrganisationActionResponse> {
    await this.botService.updateBot(this.actor(), params.organisationId, params.botId, body);
    return { success: true };
  }

  @Post('/:botId/suspend')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @HttpStatus(200)
  @RespondFor(200, OrganisationActionResponse)
  async suspendBot(@Params() params: BotParams): Promise<OrganisationActionResponse> {
    await this.botService.suspendBot(this.actor(), params.organisationId, params.botId);
    return { success: true };
  }

  @Post('/:botId/resume')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @HttpStatus(200)
  @RespondFor(200, OrganisationActionResponse)
  async resumeBot(@Params() params: BotParams): Promise<OrganisationActionResponse> {
    await this.botService.resumeBot(this.actor(), params.organisationId, params.botId);
    return { success: true };
  }

  @Get('/:botId/keys')
  @RespondFor(200, BotKeysResponse)
  async listKeys(@Params() params: BotParams): Promise<{ keys: BotKeySummary[] }> {
    return { keys: await this.botKeyService.listKeys(params.organisationId, params.botId) };
  }

  @Post('/:botId/keys')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @HttpStatus(201)
  @RespondFor(201, CreatedBotKeyResponse)
  createKey(@Params() params: BotParams, @Body() body: CreateBotKeyBody): Promise<CreatedBotKey> {
    return this.botKeyService.createKey(this.actor(), params.organisationId, params.botId, body);
  }

  @Delete('/:botId/keys/:keyId')
  @Auth({ orgRole: 'ADMIN', elevated: true })
  @RespondFor(200, OrganisationActionResponse)
  async revokeKey(@Params() params: BotKeyParams): Promise<OrganisationActionResponse> {
    await this.botKeyService.revokeKey(this.actor(), params.organisationId, params.botId, params.keyId);
    return { success: true };
  }
}
