import { Authenticated } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Put, RespondFor } from '@shadow-library/fastify';

import { ACCOUNT_MODEL_GROUPS, AccountSettingsService } from './account-settings.service';
import { AccountSettingsResponse, AiModelOption, AiModelsResponse, UpdateAccountSettingsBody } from './ai.dto';
import { PRODUCTION_GROUP_DEFAULTS, UNRESTRICTED_GROUP_DEFAULTS, UNRESTRICTED_IMAGE_ALLOWLIST, UNRESTRICTED_LLM_ALLOWLIST } from './defaults';
import { MODEL_REGISTRY } from './models';

@Authenticated()
@HttpController('/api/v1/ai')
export class AiController {
  constructor(private readonly accountSettings: AccountSettingsService) {}

  @Get('/settings')
  @RespondFor(200, AccountSettingsResponse)
  async getSettings(): Promise<AccountSettingsResponse> {
    return { models: await this.accountSettings.getModels() };
  }

  @Put('/settings')
  @RespondFor(200, AccountSettingsResponse)
  async updateSettings(@Body() body: UpdateAccountSettingsBody): Promise<AccountSettingsResponse> {
    return { models: await this.accountSettings.updateModels(body.models) };
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

    // The author picks a model per group, not per fine-grained role, and only for the author-configurable groups: `embedding` is
    // locked to the pgvector dimension and `vision` must stay image-capable. The response's `role` field carries the group key.
    const toRoleDefaults = (groups: typeof UNRESTRICTED_GROUP_DEFAULTS) =>
      ACCOUNT_MODEL_GROUPS.map(group => ({ role: group, provider: groups[group].provider, model: groups[group].model }));

    return {
      profile: 'production',
      models: registry,
      defaults: toRoleDefaults(PRODUCTION_GROUP_DEFAULTS),
      unrestrictedDefaults: toRoleDefaults(UNRESTRICTED_GROUP_DEFAULTS),
      unrestrictedAllowlist: [...UNRESTRICTED_LLM_ALLOWLIST, ...UNRESTRICTED_IMAGE_ALLOWLIST],
    };
  }
}
