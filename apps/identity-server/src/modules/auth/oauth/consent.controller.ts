/**
 * Importing npm packages
 */

import { Body, Get, HttpController, HttpStatus, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';

import { ConsentDecisionBody, ConsentDecisionResponse, ConsentPromptQuery, ConsentPromptResponse } from './consent.dto';
import { type ConsentDecisionData, type ConsentPromptData, ConsentService } from './consent.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/auth/consent')
@Auth({ session: true })
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  /** Describes a pending consent prompt: who is asking and for what, in user terms. */
  @Get()
  @RespondFor(200, ConsentPromptResponse)
  getConsentPrompt(@Query() query: ConsentPromptQuery): Promise<ConsentPromptData> {
    return this.consentService.buildPrompt(Context.getSession().userId, query.clientId, query.scope);
  }

  /** Records the user's decision; denials answer with the validated `access_denied` redirect. */
  @Post()
  @HttpStatus(200)
  @RespondFor(200, ConsentDecisionResponse)
  submitConsentDecision(@Body() body: ConsentDecisionBody): Promise<ConsentDecisionData> {
    return this.consentService.decide({ session: Context.getSession(), ip: Context.getClientInfo().ip }, body);
  }
}
