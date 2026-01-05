/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SenderRoutingRuleService } from '@modules/configuration';
import { AppErrorCode } from '@server/classes';

import {
  CreateRoutingRuleBody,
  ListSenderRoutingRuleResponse,
  ListSenderRoutingRulesQuery,
  SenderRoutingRuleDetailResponse,
  SenderRoutingRuleParams,
  SenderRoutingRuleResponse,
  UpdateSenderRoutingRuleBody,
} from './dtos';

/**
 * Declaring the constants
 */

@HttpController('/sender-routing-rules')
export class SenderRoutingRuleController {
  constructor(private readonly senderRoutingRuleService: SenderRoutingRuleService) {}

  @Post()
  @RespondFor(201, SenderRoutingRuleResponse)
  createSenderRoutingRule(@Body() body: CreateRoutingRuleBody): Promise<SenderRoutingRuleResponse> {
    return this.senderRoutingRuleService.createRoutingRule(body);
  }

  @Get()
  @RespondFor(200, ListSenderRoutingRuleResponse)
  listSenderRoutingRules(@Query() query: ListSenderRoutingRulesQuery): Promise<ListSenderRoutingRuleResponse> {
    return this.senderRoutingRuleService.listSenderRoutingRules(query);
  }

  @Get('/:routingRuleId')
  @RespondFor(200, SenderRoutingRuleDetailResponse)
  async getSenderRoutingRule(@Params() params: SenderRoutingRuleParams): Promise<SenderRoutingRuleDetailResponse> {
    const senderRoutingRule = await this.senderRoutingRuleService.getSenderRoutingRule(params.routingRuleId);
    if (!senderRoutingRule) throw new ServerError(AppErrorCode.SND_RTR_001);
    return senderRoutingRule;
  }

  @Patch('/:routingRuleId')
  @RespondFor(200, SenderRoutingRuleResponse)
  updateSenderRoutingRule(@Params() params: SenderRoutingRuleParams, @Body() body: UpdateSenderRoutingRuleBody): Promise<SenderRoutingRuleResponse> {
    return this.senderRoutingRuleService.updateSenderRoutingRule(params.routingRuleId, body.senderProfileId);
  }

  @Delete('/:routingRuleId')
  @HttpStatus(204)
  deleteSenderRoutingRule(@Params() params: SenderRoutingRuleParams): Promise<void> {
    return this.senderRoutingRuleService.deleteSenderRoutingRule(params.routingRuleId);
  }
}
