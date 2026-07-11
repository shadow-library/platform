/**
 * Importing npm packages
 */
import { Body, HttpController, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

import { CheckRequestBody, CheckResponse } from './authz.dto';
import { PolicyDecisionService } from './policy-decision.service';
import { RequireServiceToken } from './service-token.guard';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/authz')
export class AuthzController {
  constructor(private readonly pdp: PolicyDecisionService) {}

  @Post('/check')
  @RequireServiceToken('authz:check')
  @RespondFor(200, CheckResponse)
  check(@Body() body: CheckRequestBody): Promise<CheckResponse> {
    return this.pdp.check({ principal: { type: body.principalType, id: body.principalId }, organisationId: body.organisationId, action: body.action });
  }
}
