/**
 * Importing npm packages
 */
import { type FastifyRequest } from 'fastify';
import { Delete, Get, HttpController, Params, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SessionAuthService } from '@server/modules/auth/session';
import { AuditService } from '@server/modules/infrastructure/audit';

import { ConsentClientParams, ConsentOperationResponse, ConsentRecordsResponse } from './consent.dto';
import { ConsentService } from './consent.service';
import { OAuthClientService } from './oauth-client.service';

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
export class MeConsentController {
  constructor(
    private readonly sessionAuthService: SessionAuthService,
    private readonly consentService: ConsentService,
    private readonly clientService: OAuthClientService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RespondFor(200, ConsentRecordsResponse)
  async list(@Req() request: FastifyRequest): Promise<ConsentRecordsResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const consents = await this.consentService.listForUser(session.userId);
    const items = await Promise.all(
      consents.map(async consent => {
        const client = await this.clientService.getClient(consent.clientId);
        return {
          clientId: consent.clientId,
          clientName: client?.name ?? 'Unknown application',
          scopeNames: consent.scopeNames,
          source: consent.source,
          grantedAt: consent.grantedAt.toISOString(),
        };
      }),
    );
    return { items };
  }

  @Delete('/:clientId')
  @RespondFor(200, ConsentOperationResponse)
  async revoke(@Params() params: ConsentClientParams, @Req() request: FastifyRequest): Promise<ConsentOperationResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    await this.consentService.withdraw(session.userId, params.clientId);
    await this.auditService.record({
      action: 'oauth.consent.withdrawn',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: session.userId.toString(),
      targetType: 'oauth_client',
      targetId: params.clientId,
      ipAddress: request.ip,
    });
    return { success: true };
  }
}
