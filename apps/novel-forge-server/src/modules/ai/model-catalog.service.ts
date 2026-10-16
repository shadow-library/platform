import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { type AiModelOption, type AiModelsResponse } from './ai.dto';
import { isSynapseBackend } from './ai-backend';
import {
  type AiRole,
  CONTENT_MODES,
  COST_TIER_DEFAULTS,
  COST_TIERS,
  isUnrestrictedAllowed,
  PRODUCTION_GROUP_DEFAULTS,
  type ResolvedModel,
  SELECTABLE_MODEL_GROUPS,
  type SelectableModelGroup,
  UNRESTRICTED_GROUP_DEFAULTS,
  UNRESTRICTED_IMAGE_ALLOWLIST,
  UNRESTRICTED_LLM_ALLOWLIST,
} from './defaults';
import { ModelRouterService } from './model-router.service';
import { MODEL_MAP, MODEL_REGISTRY } from './models';
import { NovelForgeCatalogService } from './novel-forge-catalog.service';

export interface PricedModel extends ResolvedModel {
  label: string;
  inputPricePerMToken?: number;
  outputPricePerMToken?: number;
}

export interface TierModel extends PricedModel {
  costTier: Project.CostTier;
  contentMode: Project.ContentMode;
  group: SelectableModelGroup;
}

export interface ProjectGroupModel extends PricedModel {
  group: SelectableModelGroup;
}

export interface ProjectModels {
  contentMode: Project.ContentMode;
  costTier: Project.CostTier;
  models: ProjectGroupModel[];
  chatAliases: string[];
}

export interface ModelSelectionPreview {
  contentMode?: Project.ContentMode;
  costTier?: Project.CostTier;
}

const GROUP_ROLE: Record<SelectableModelGroup, AiRole> = { writing: 'generation', planning: 'plan', review: 'judge', chat: 'chat', helper: 'title', image: 'image' };

export function priced(resolved: ResolvedModel): PricedModel {
  const entry = MODEL_MAP[resolved.model];
  const label = entry && entry.kind !== 'embedding' ? entry.label : resolved.model;
  return { ...resolved, label, inputPricePerMToken: entry?.inputPricePerMToken, outputPricePerMToken: entry?.outputPricePerMToken };
}

export function tierCatalog(): TierModel[] {
  return COST_TIERS.flatMap(costTier =>
    CONTENT_MODES.flatMap(contentMode => SELECTABLE_MODEL_GROUPS.map(group => ({ costTier, contentMode, group, ...priced(COST_TIER_DEFAULTS[costTier][contentMode][group]) }))),
  );
}

/** The registry models a chat may pin under a model type, as the legacy router honours them: every LLM, or only the allowlist when unrestricted. */
export function registryChatOptions(contentMode: Project.ContentMode): string[] {
  return MODEL_REGISTRY.filter(m => m.kind === 'llm' && (contentMode === 'standard' || isUnrestrictedAllowed('chat', { provider: m.provider, model: m.id }))).map(m => m.id);
}

/** The registry's own answer to `GET /api/v1/ai/models`, served only on the legacy backend. */
export function legacyModelsResponse(): AiModelsResponse {
  const models: AiModelOption[] = MODEL_REGISTRY.map(m => ({
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
    models,
    defaults: toRoleDefaults(PRODUCTION_GROUP_DEFAULTS),
    unrestrictedDefaults: toRoleDefaults(UNRESTRICTED_GROUP_DEFAULTS),
    unrestrictedAllowlist: [...UNRESTRICTED_LLM_ALLOWLIST, ...UNRESTRICTED_IMAGE_ALLOWLIST],
    tiers: tierCatalog(),
    modelLabels: models.map(({ id, label, inputPricePerMToken, outputPricePerMToken }) => ({ model: id, label, inputPricePerMToken, outputPricePerMToken })),
  };
}

@Injectable()
export class ModelCatalogService {
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly catalog: NovelForgeCatalogService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  models(): Promise<AiModelsResponse> {
    return isSynapseBackend() ? this.catalog.modelsResponse() : Promise.resolve(legacyModelsResponse());
  }

  async projectModels(projectId: bigint, preview: ModelSelectionPreview = {}): Promise<ProjectModels> {
    const row = await this.db.query.projects.findFirst({
      where: eq(schema.projects.id, projectId),
      columns: { contentMode: true, costTier: true },
    });
    if (!row) throw AppErrorCode.PRJ_001.create();
    const selection = { contentMode: preview.contentMode ?? row.contentMode, costTier: preview.costTier ?? row.costTier };
    if (isSynapseBackend()) return { ...selection, ...(await this.catalog.selectionModels(selection)) };
    const models = SELECTABLE_MODEL_GROUPS.map(group => ({ group, ...priced(this.modelRouter.resolveModel(GROUP_ROLE[group], selection)) }));
    return { ...selection, models, chatAliases: registryChatOptions(selection.contentMode) };
  }
}
