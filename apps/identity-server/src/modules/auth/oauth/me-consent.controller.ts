import { Delete, Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';

import { ConsentClientParams, ConsentOperationResponse, ConsentRecordsResponse } from './consent.dto';
import { type ConsentRecordData, ConsentService } from './consent.service';

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
