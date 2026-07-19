/**
 * Importing npm packages
 */
import { Delete, Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';

import { ConsentClientParams, ConsentOperationResponse, ConsentRecordsResponse } from './consent.dto';
import { type ConsentRecordData, ConsentService } from './consent.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Self-service consent management (the account portal's "Connected apps" surface): the signed-in user
 * reviews the applications holding an active grant and revokes any of them. Revocation cascades to the
 * client's refresh-token families through `ConsentService.withdraw`.
 */

@HttpController('/api/v1/me/consents')
@Auth({ session: true })
export class MeConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get()
  @RespondFor(200, ConsentRecordsResponse)
  async listMyConsents(): Promise<{ items: ConsentRecordData[] }> {
    return { items: await this.consentService.listConsentRecords(Context.getSession().userId) };
  }

  @Delete('/:clientId')
  @RespondFor(200, ConsentOperationResponse)
  async revokeMyConsent(@Params() params: ConsentClientParams): Promise<ConsentOperationResponse> {
    await this.consentService.withdrawForUser({ session: Context.getSession(), ip: Context.getClientInfo().ip }, params.clientId);
    return { success: true };
  }
}
