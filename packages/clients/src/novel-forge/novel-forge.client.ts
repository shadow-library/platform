import { callService, pathParam } from '../service-call';
import { type ServiceFetch, type ServiceTarget } from '../service-fetch';
import { type CallOptions, type ServiceResponse } from '../service-response';
import { type BotOwnershipResponse, type TransferOwnershipBody, type TransferOwnershipResponse } from './novel-forge-api.gen';

export const NOVEL_FORGE_BOTS_TARGET: ServiceTarget = { service: 'novel-forge-server', resource: 'api://novel-forge', scopes: ['novel-forge:bots:manage'] };

/** Novel Forge's `/internal/bots/*` is the bot-ownership protocol's reference: another bot-aware application answers the same routes under its own target. */
export class NovelForgeClient {
  constructor(
    private readonly fetch: ServiceFetch,
    private readonly target: ServiceTarget = NOVEL_FORGE_BOTS_TARGET,
  ) {}

  getBotOwnership(botId: bigint | string, options: CallOptions = {}): Promise<ServiceResponse<BotOwnershipResponse>> {
    return callService(this.fetch, this.target, { ...options, method: 'GET', path: `/internal/bots/${pathParam(botId)}/ownership` });
  }

  transferBotOwnership(botId: bigint | string, body: TransferOwnershipBody, options: CallOptions = {}): Promise<ServiceResponse<TransferOwnershipResponse>> {
    return callService(this.fetch, this.target, { ...options, method: 'POST', path: `/internal/bots/${pathParam(botId)}/transfer`, body });
  }
}
