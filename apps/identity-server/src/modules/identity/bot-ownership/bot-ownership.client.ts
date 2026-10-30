import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { type ServiceFetch, type ServiceResponse } from '@shadow-library/clients';
import { NovelForgeClient } from '@shadow-library/clients/novel-forge';

import { APP_NAME } from '@server/constants';
import { serviceFetchFrom, ServiceTokenService } from '@server/modules/infrastructure/service-token';

import { OWNERSHIP_LOOKUP_TIMEOUT_MS, OWNERSHIP_TRANSFER_TIMEOUT_MS } from './bot-ownership.constants';
import { type BotAwareApplication, type BotOwnedRecords } from './bot-ownership.types';

@Injectable()
export class BotOwnershipClient {
  private readonly logger = Logger.getLogger(APP_NAME, BotOwnershipClient.name);
  private readonly fetch: ServiceFetch;

  constructor(serviceTokenService: ServiceTokenService) {
    this.fetch = serviceFetchFrom(serviceTokenService);
  }

  async countOwned(application: BotAwareApplication, botId: bigint): Promise<BotOwnedRecords[]> {
    const response = await this.clientFor(application).getBotOwnership(botId, { timeoutMs: OWNERSHIP_LOOKUP_TIMEOUT_MS });
    return this.toRecords(this.assertOk(application, response));
  }

  async transfer(application: BotAwareApplication, botId: bigint, toUserId: bigint): Promise<BotOwnedRecords[]> {
    const response = await this.clientFor(application).transferBotOwnership(botId, { toUserId: toUserId.toString() }, { timeoutMs: OWNERSHIP_TRANSFER_TIMEOUT_MS });
    const moved = this.toRecords(this.assertOk(application, response));
    this.logger.info('transferred bot-owned records', { application: application.name, botId: botId.toString(), toUserId: toUserId.toString(), moved });
    return moved;
  }

  /** Every bot-aware application answers Novel Forge's `/internal/bots/*` protocol, each under its own service, audience and scope. */
  private clientFor(application: BotAwareApplication): NovelForgeClient {
    return new NovelForgeClient(this.fetch, { service: `${application.name}-server`, resource: application.audience, scopes: [application.scope] });
  }

  /**
   * The counts an application reports are its own vocabulary (`projects`, `illustrations`, …), so
   * every numeric member is carried through rather than mapped onto a fixed shape identity would
   * have to widen for each new application.
   */
  private toRecords(data: object | undefined): BotOwnedRecords[] {
    if (!data) return [];
    return Object.entries(data)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .map(([kind, count]) => ({ kind, count }));
  }

  private assertOk<T>(application: BotAwareApplication, response: ServiceResponse<T>): T {
    if (response.ok) return response.data;
    this.logger.error('bot ownership call rejected', { application: application.name, statusCode: response.status, body: response.error });
    throw AppError.internal(`${application.name} answered ${response.status}`);
  }
}
