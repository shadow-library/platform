import { Injectable } from '@shadow-library/app';
import { APIRequest, type APIResponse, AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { ServiceTokenService } from '@server/modules/infrastructure/service-token';

import { botOwnershipUrl, OWNERSHIP_LOOKUP_TIMEOUT_MS, OWNERSHIP_TRANSFER_TIMEOUT_MS } from './bot-ownership.constants';
import { type BotAwareApplication, type BotOwnedRecords } from './bot-ownership.types';

@Injectable()
export class BotOwnershipClient {
  private readonly logger = Logger.getLogger(APP_NAME, BotOwnershipClient.name);

  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  async countOwned(application: BotAwareApplication, botId: bigint): Promise<BotOwnedRecords[]> {
    const send = async (): Promise<APIResponse<Record<string, unknown>>> =>
      APIRequest.get(botOwnershipUrl(application.name, botId, 'ownership'))
        .header('authorization', `Bearer ${await this.serviceTokenService.getToken(application.audience, application.scope)}`)
        .timeout(OWNERSHIP_LOOKUP_TIMEOUT_MS)
        .suppressErrors()
        .execute<Record<string, unknown>>();

    return this.toRecords((await this.sendAuthenticated(application, send)).data);
  }

  async transfer(application: BotAwareApplication, botId: bigint, toUserId: bigint): Promise<BotOwnedRecords[]> {
    const send = async (): Promise<APIResponse<Record<string, unknown>>> =>
      APIRequest.post(botOwnershipUrl(application.name, botId, 'transfer'))
        .header('authorization', `Bearer ${await this.serviceTokenService.getToken(application.audience, application.scope)}`)
        .body({ toUserId: toUserId.toString() })
        .timeout(OWNERSHIP_TRANSFER_TIMEOUT_MS)
        .suppressErrors()
        .execute<Record<string, unknown>>();

    const moved = this.toRecords((await this.sendAuthenticated(application, send)).data);
    this.logger.info('transferred bot-owned records', { application: application.name, botId: botId.toString(), toUserId: toUserId.toString(), moved });
    return moved;
  }

  /** A rotated signing key only shows up as a rejection, so the cached token is dropped and the call retried once rather than spending one of the transfer's attempts. */
  private async sendAuthenticated(application: BotAwareApplication, send: () => Promise<APIResponse<Record<string, unknown>>>): Promise<APIResponse<Record<string, unknown>>> {
    const response = await send();
    if (response.statusCode !== 401 && response.statusCode !== 403) {
      this.assertOk(application, response.statusCode, response.data);
      return response;
    }

    this.serviceTokenService.invalidate(application.audience, application.scope);
    const retried = await send();
    this.assertOk(application, retried.statusCode, retried.data);
    return retried;
  }

  /**
   * The counts an application reports are its own vocabulary (`projects`, `illustrations`, …), so
   * every numeric member is carried through rather than mapped onto a fixed shape identity would
   * have to widen for each new application.
   */
  private toRecords(data: Record<string, unknown> | null): BotOwnedRecords[] {
    if (!data) return [];
    return Object.entries(data)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .map(([kind, count]) => ({ kind, count }));
  }

  private assertOk(application: BotAwareApplication, statusCode: number, data: unknown): void {
    if (statusCode < 400) return;
    this.logger.error('bot ownership call rejected', { application: application.name, statusCode, body: data });
    throw AppError.internal(`${application.name} answered ${statusCode}`);
  }
}
