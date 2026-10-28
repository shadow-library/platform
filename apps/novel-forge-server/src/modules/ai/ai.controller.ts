import { Authenticated } from '@shadow-library/auth/module';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { ActorService } from '@modules/actor';

import { AiQuotaService } from './ai-quota.service';
import { AiUsageService } from './ai-usage.service';
import { AccountUsageResponse, AiModelsResponse, AiQuotaResponse } from './ai.dto';
import { ModelCatalogService } from './model-catalog.service';

@Authenticated()
@HttpController('/api/v1/ai')
export class AiController {
  constructor(
    private readonly actorService: ActorService,
    private readonly aiUsage: AiUsageService,
    private readonly aiQuota: AiQuotaService,
    private readonly modelCatalog: ModelCatalogService,
  ) {}

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
