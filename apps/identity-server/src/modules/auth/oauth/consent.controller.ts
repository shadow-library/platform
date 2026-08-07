import { Body, Get, HttpController, HttpStatus, Post, Query, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';

import { ConsentDecisionBody, ConsentDecisionResponse, ConsentPromptQuery, ConsentPromptResponse } from './consent.dto';
import { type ConsentDecisionData, type ConsentPromptData, ConsentService } from './consent.service';

@HttpController('/api/v1/auth/consent')
@Auth({ session: true })
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get()
  @RespondFor(200, ConsentPromptResponse)
  getConsentPrompt(@Query() query: ConsentPromptQuery): Promise<ConsentPromptData> {
    return this.consentService.buildPrompt(Context.getSession().userId, query.clientId, query.scope);
  }

  @Post()
  @HttpStatus(200)
  @RespondFor(200, ConsentDecisionResponse)
  submitConsentDecision(@Body() body: ConsentDecisionBody): Promise<ConsentDecisionData> {
    return this.consentService.decide({ session: Context.getSession(), ip: Context.getClientInfo().ip }, body);
  }
}
