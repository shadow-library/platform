import { Authenticated } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Put, RespondFor } from '@shadow-library/fastify';

import { ActorService } from '@modules/actor';

import { AiQuotaService } from './ai-quota.service';
import { AiUsageService } from './ai-usage.service';
import { AccountSettingsService } from './account-settings.service';
import { AccountSettingsResponse, AccountUsageResponse, AiModelOption, AiModelsResponse, AiQuotaResponse, UpdateAccountSettingsBody } from './ai.dto';
import { PRODUCTION_GROUP_DEFAULTS, SELECTABLE_MODEL_GROUPS, UNRESTRICTED_GROUP_DEFAULTS, UNRESTRICTED_IMAGE_ALLOWLIST, UNRESTRICTED_LLM_ALLOWLIST } from './defaults';
import { tierCatalog } from './model-catalog.service';
import { MODEL_REGISTRY } from './models';

@Authenticated()
@HttpController('/api/v1/ai')
export class AiController {
  constructor(
    private readonly accountSettings: AccountSettingsService,
    private readonly actorService: ActorService,
    private readonly aiUsage: AiUsageService,
    private readonly aiQuota: AiQuotaService,
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
  listModels(): AiModelsResponse {
    const registry: AiModelOption[] = MODEL_REGISTRY.map(m => ({
      id: m.id,
      provider: m.provider,
      label: m.kind === 'embedding' ? m.id : m.label,
      kind: m.kind,
      enabled: true,
      contextWindow: m.contextWindow,
      inputPricePerMToken: m.inputPricePerMToken,
      outputPricePerMToken: m.outputPricePerMToken,
      supportsTools: m.supportsTools,
      supportsStructuredOutput: m.supportsStructuredOutput,
    }));

    // The author picks a model per group, not per fine-grained role; the response's `role` field carries the group key.
    const toRoleDefaults = (groups: typeof UNRESTRICTED_GROUP_DEFAULTS) =>
      SELECTABLE_MODEL_GROUPS.map(group => ({ role: group, provider: groups[group].provider, model: groups[group].model }));

    return {
      profile: 'production',
      models: registry,
      defaults: toRoleDefaults(PRODUCTION_GROUP_DEFAULTS),
      unrestrictedDefaults: toRoleDefaults(UNRESTRICTED_GROUP_DEFAULTS),
      unrestrictedAllowlist: [...UNRESTRICTED_LLM_ALLOWLIST, ...UNRESTRICTED_IMAGE_ALLOWLIST],
      tiers: tierCatalog(),
    };
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
