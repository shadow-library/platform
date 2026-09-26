import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { type AiRole, CONTENT_MODES, COST_TIER_DEFAULTS, COST_TIERS, type ResolvedModel, SELECTABLE_MODEL_GROUPS, type SelectableModelGroup } from './defaults';
import { ModelRouterService, type ModelSource, type ProjectConfig } from './model-router.service';
import { MODEL_MAP } from './models';

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
  source: ModelSource;
}

export interface ProjectModels {
  contentMode: Project.ContentMode;
  costTier: Project.CostTier;
  models: ProjectGroupModel[];
}

export interface ModelSelectionPreview {
  contentMode?: Project.ContentMode;
  costTier?: Project.CostTier;
}

// Every role routes like the rest of its group, except that `chat` also reads the project's planning pick.
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

@Injectable()
export class ModelCatalogService {
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async projectModels(projectId: bigint, preview: ModelSelectionPreview = {}): Promise<ProjectModels> {
    const row = await this.db.query.projects.findFirst({
      where: eq(schema.projects.id, projectId),
      columns: { contentMode: true, costTier: true, config: true },
    });
    if (!row) throw AppErrorCode.PRJ_001.create();
    const selection = { contentMode: preview.contentMode ?? row.contentMode, costTier: preview.costTier ?? row.costTier };
    const project: ProjectConfig = { ...(row as ProjectConfig), ...selection };
    const models = SELECTABLE_MODEL_GROUPS.map(group => {
      const route = this.modelRouter.routeModel(GROUP_ROLE[group], project);
      return { group, source: route.source, ...priced(route.resolved) };
    });
    return { ...selection, models };
  }
}
