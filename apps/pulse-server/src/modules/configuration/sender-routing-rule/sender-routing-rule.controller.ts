/**
 * Importing npm packages
 */
import { RequirePermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { PULSE_PERMISSIONS } from '@modules/auth';
import { AppErrorCode } from '@server/classes';

import {
  CreateRoutingRuleBody,
  ListSenderRoutingRuleResponse,
  ListSenderRoutingRulesQuery,
  SenderRoutingRuleDetailResponse,
  SenderRoutingRuleParams,
  SenderRoutingRuleResponse,
  UpdateSenderRoutingRuleBody,
} from './sender-routing-rule.dto';
import { SenderRoutingRuleService } from './sender-routing-rule.service';

/**
 * Declaring the constants
 */

@HttpController('/api/v1/sender-routing-rules')
export class SenderRoutingRuleController {
  constructor(private readonly senderRoutingRuleService: SenderRoutingRuleService) {}

  @Post()
  @RequirePermission(PULSE_PERMISSIONS.sendersWrite)
  @RespondFor(201, SenderRoutingRuleResponse)
  createSenderRoutingRule(@Body() body: CreateRoutingRuleBody): Promise<SenderRoutingRuleResponse> {
    return this.senderRoutingRuleService.createRoutingRule(body);
  }

  @Get()
  @RequirePermission(PULSE_PERMISSIONS.sendersRead)
  @RespondFor(200, ListSenderRoutingRuleResponse)
  listSenderRoutingRules(@Query() query: ListSenderRoutingRulesQuery): Promise<ListSenderRoutingRuleResponse> {
    return this.senderRoutingRuleService.listSenderRoutingRules(query);
  }

  @Get('/:routingRuleId')
  @RequirePermission(PULSE_PERMISSIONS.sendersRead)
  @RespondFor(200, SenderRoutingRuleDetailResponse)
  async getSenderRoutingRule(@Params() params: SenderRoutingRuleParams): Promise<SenderRoutingRuleDetailResponse> {
    const senderRoutingRule = await this.senderRoutingRuleService.getSenderRoutingRule(params.routingRuleId);
    if (!senderRoutingRule) throw AppErrorCode.SND_RTR_001.create();
    return senderRoutingRule;
  }

  @Patch('/:routingRuleId')
  @RequirePermission(PULSE_PERMISSIONS.sendersWrite)
  @RespondFor(200, SenderRoutingRuleResponse)
  updateSenderRoutingRule(@Params() params: SenderRoutingRuleParams, @Body() body: UpdateSenderRoutingRuleBody): Promise<SenderRoutingRuleResponse> {
    return this.senderRoutingRuleService.updateSenderRoutingRule(params.routingRuleId, body.senderProfileId);
  }

  @Delete('/:routingRuleId')
  @RequirePermission(PULSE_PERMISSIONS.sendersWrite)
  @HttpStatus(204)
  deleteSenderRoutingRule(@Params() params: SenderRoutingRuleParams): Promise<void> {
    return this.senderRoutingRuleService.deleteSenderRoutingRule(params.routingRuleId);
  }
}
