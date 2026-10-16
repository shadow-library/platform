import { Authenticated } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Put, RespondFor } from '@shadow-library/fastify';

import { ActorService } from '@modules/actor';

import { AiQuotaService } from './ai-quota.service';
import { AiUsageService } from './ai-usage.service';
import { AccountSettingsService } from './account-settings.service';
import { AccountSettingsResponse, AccountUsageResponse, AiModelsResponse, AiQuotaResponse, UpdateAccountSettingsBody } from './ai.dto';
import { ModelCatalogService } from './model-catalog.service';

@Authenticated()
@HttpController('/api/v1/ai')
export class AiController {
  constructor(
    private readonly accountSettings: AccountSettingsService,
    private readonly actorService: ActorService,
    private readonly aiUsage: AiUsageService,
    private readonly aiQuota: AiQuotaService,
    private readonly modelCatalog: ModelCatalogService,
  ) {}

  @Get('/settings')
  @RespondFor(200, AccountSettingsResponse)
  getSettings(): Promise<AccountSettingsResponse> {
    return this.accountSettings.get();
  }

  @Put('/settings')
  @RespondFor(200, AccountSettingsResponse)
  updateSettings(@Body() body: UpdateAccountSettingsBody): Promise<AccountSettingsResponse> {
    return this.accountSettings.update(body);
  }

  @Get('/models')
  @RespondFor(200, AiModelsResponse)
  listModels(): Promise<AiModelsResponse> {
    return this.modelCatalog.models();
  }

  @Get('/usage')
  @RespondFor(200, AccountUsageResponse)
  usage(): Promise<AccountUsageResponse> {
    return this.aiUsage.usage(this.actorService.current());
  }

  @Get('/quota')
  @RespondFor(200, AiQuotaResponse)
  quota(): Promise<AiQuotaResponse> {
    return this.aiQuota.currentWindowStatus(this.actorService.current());
  }
}
