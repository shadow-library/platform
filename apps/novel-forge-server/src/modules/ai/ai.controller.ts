import { Authenticated, RequirePermission } from '@shadow-library/auth/module';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

import { ADMIN_PERMISSION } from '@server/constants';

import { ActorService, AdminAccessService } from '@modules/actor';

import { AiQuotaService } from './ai-quota.service';
import { AiUsageService } from './ai-usage.service';
import { AccountUsageResponse, AiModelsAdminResponse, AiModelsResponse, AiQuotaResponse } from './ai.dto';
import { withoutModelBreakdown } from '../project/project/project-cost';
import { ModelCatalogService } from './model-catalog.service';

@Authenticated()
@HttpController('/api/v1/ai')
export class AiController {
  constructor(
    private readonly actorService: ActorService,
    private readonly adminAccess: AdminAccessService,
    private readonly aiUsage: AiUsageService,
    private readonly aiQuota: AiQuotaService,
    private readonly modelCatalog: ModelCatalogService,
  ) {}

  @Get('/models')
  @RespondFor(200, AiModelsResponse)
  listModels(): Promise<AiModelsResponse> {
    return this.modelCatalog.authorOptions();
  }

  @RequirePermission(ADMIN_PERMISSION, { highRisk: true })
  @Get('/models/admin')
  @RespondFor(200, AiModelsAdminResponse)
  listAdminModels(): Promise<AiModelsAdminResponse> {
    return this.modelCatalog.adminModels();
  }

  @Get('/usage')
  @RespondFor(200, AccountUsageResponse)
  async usage(): Promise<AccountUsageResponse> {
    const [usage, showModels] = await Promise.all([this.aiUsage.usage(this.actorService.current()), this.adminAccess.canSeeModels()]);
    return showModels ? usage : withoutModelBreakdown(usage);
  }

  @Get('/quota')
  @RespondFor(200, AiQuotaResponse)
  quota(): Promise<AiQuotaResponse> {
    return this.aiQuota.currentWindowStatus(this.actorService.current());
  }
}
