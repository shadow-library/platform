import { RequireScope } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { BOTS_MANAGE_SCOPE } from '@server/constants';

import { BotOwnershipResponse, BotParams, TransferOwnershipBody, TransferOwnershipResponse } from './bot-ownership.dto';
import { BotOwnershipService } from './bot-ownership.service';

/**
 * Identity's half of deleting an organisation bot: it asks what the bot still owns here and hands
 * those records to a person before removing it. Reachable only by identity's own service client — the
 * scope is granted to it alone, and a service-access rule admits it to `/internal/bots/*`.
 */
@HttpController('/internal/bots')
@RequireScope(BOTS_MANAGE_SCOPE)
export class BotOwnershipController {
  constructor(private readonly botOwnershipService: BotOwnershipService) {}

  @Get('/:botId/ownership')
  @RespondFor(200, BotOwnershipResponse)
  getOwnership(@Params() params: BotParams): Promise<BotOwnershipResponse> {
    return this.botOwnershipService.countOwned(params.botId);
  }

  @Post('/:botId/transfer')
  @RespondFor(200, TransferOwnershipResponse)
  transferOwnership(@Params() params: BotParams, @Body() body: TransferOwnershipBody): Promise<TransferOwnershipResponse> {
    return this.botOwnershipService.transferToUser(params.botId, body.toUserId);
  }
}
