import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { type CatalogAliasView, type CatalogAppResponse, type CatalogModelView, type CatalogTaskView, SynapseClient } from '@shadow-library/synapse';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Project } from '@server/database';

import { type AiModelLabel, type AiModelOption, type AiModelsResponse, type AiRoleDefault } from './ai.dto';
import { CONTENT_MODES, COST_TIERS, DEFAULT_COST_TIER, type ModelGroup, SELECTABLE_MODEL_GROUPS, type SelectableModelGroup } from './defaults';
import { HISTORICAL_MODELS } from './historical-models';
import { fromSynapseFailure } from './synapse-failure';
import { SYNAPSE_CHAT_TASK, SYNAPSE_PROVIDER, synapseGroupTask, synapseSelectors } from './synapse-request';

export interface CatalogSelection {
  contentMode: Project.ContentMode;
  costTier: Project.CostTier;
}

export interface CatalogPricedModel {
  provider: string;
  model: string;
  label: string;
  inputPricePerMToken?: number;
  outputPricePerMToken?: number;
}

export interface CatalogGroupModel extends CatalogPricedModel {
  group: SelectableModelGroup;
}

export interface CatalogSelectionModels {
  models: CatalogGroupModel[];
}

export interface UnrestrictedAvailability {
  unrestrictedAvailable(): Promise<boolean>;
}

interface SelectionView extends CatalogSelection {
  view: CatalogAppResponse;
}

export const CATALOG_SELECTIONS: readonly CatalogSelection[] = COST_TIERS.flatMap(costTier => CONTENT_MODES.map(contentMode => ({ costTier, contentMode })));

/** Every group an author's work reaches; embedding carries no content mode. */
export const UNRESTRICTED_GROUPS: readonly ModelGroup[] = ['writing', 'planning', 'review', 'chat', 'helper', 'vision', 'image'];

/** A task the selectors did not match falls to its selector-less default route, which an unrestricted call never takes. */
export function routesUnrestricted(views: readonly CatalogAppResponse[]): boolean {
  return views.length > 0 && views.every(view => UNRESTRICTED_GROUPS.every(group => view.tasks[synapseGroupTask(group)]?.matched === true));
}

/** Refuses unrestricted writing unless the catalog routes it for every task and tier; no catalog to ask refuses too. */
export async function requireUnrestricted(availability: UnrestrictedAvailability | undefined): Promise<void> {
  if (!(await availability?.unrestrictedAvailable())) throw AppErrorCode.AI_024.create();
}

/** An image model is priced per image, so it carries no per-token price. */
export function tokenPrices({ price }: Pick<CatalogModelView, 'price'>): Pick<CatalogPricedModel, 'inputPricePerMToken' | 'outputPricePerMToken'> {
  if (price.perImage !== undefined) return {};
  return { inputPricePerMToken: price.input, outputPricePerMToken: price.output };
}

export function catalogGroupModels(view: CatalogAppResponse): CatalogGroupModel[] {
  return SELECTABLE_MODEL_GROUPS.flatMap(group => {
    const task = view.tasks[synapseGroupTask(group)];
    return task ? [{ group, provider: SYNAPSE_PROVIDER, model: task.default.model, label: task.default.label, ...tokenPrices(task.default) }] : [];
  });
}

export function aliasOption(alias: CatalogAliasView): AiModelOption {
  return {
    id: alias.key,
    provider: SYNAPSE_PROVIDER,
    label: alias.label,
    kind: 'llm',
    enabled: true,
    ...(alias.capabilities.context !== undefined && { contextWindow: alias.capabilities.context }),
    ...tokenPrices(alias),
    supportsTools: alias.capabilities.tools,
    supportsStructuredOutput: true,
  };
}

function chatAliasesOf(view: CatalogAppResponse): readonly CatalogAliasView[] {
  return view.tasks[SYNAPSE_CHAT_TASK]?.aliases ?? [];
}

function historicalLabels(): AiModelLabel[] {
  return Object.entries(HISTORICAL_MODELS).map(([model, entry]) => ({ model, ...entry }));
}

/**
 * Names for every model key a record may hold: the historical name for rows written before Synapse, then each alias's for its target, then the
 * model's own label wherever a task routes to it, which wins because it is the label Synapse gives a call no alias chose.
 */
export function catalogModelLabels(views: readonly CatalogAppResponse[]): AiModelLabel[] {
  const labels = new Map(historicalLabels().map(entry => [entry.model, entry]));
  const tasks = views.flatMap(view => Object.values(view.tasks));
  const aliases = tasks.flatMap(task => task.aliases);
  for (const alias of aliases) if (!labels.has(alias.model)) labels.set(alias.model, { model: alias.model, label: alias.label, ...tokenPrices(alias) });
  for (const { default: model } of tasks) labels.set(model.model, { model: model.model, label: model.label, ...tokenPrices(model) });
  return [...labels.values()];
}

export function catalogModelsResponse(views: readonly SelectionView[]): AiModelsResponse {
  const options = new Map<string, AiModelOption>();
  for (const { view } of views) for (const alias of chatAliasesOf(view)) if (!options.has(alias.key)) options.set(alias.key, aliasOption(alias));
  const unrestricted = new Set(views.filter(({ contentMode }) => contentMode === 'unrestricted').flatMap(({ view }) => chatAliasesOf(view).map(alias => alias.key)));
  const defaultsFor = (contentMode: Project.ContentMode): AiRoleDefault[] => {
    const entry = views.find(view => view.costTier === DEFAULT_COST_TIER && view.contentMode === contentMode);
    return entry ? catalogGroupModels(entry.view).map(({ group, provider, model }) => ({ role: group, provider, model })) : [];
  };
  const unrestrictedViews = views.filter(({ contentMode }) => contentMode === 'unrestricted').map(({ view }) => view);
  return {
    profile: 'production',
    unrestrictedAvailable: routesUnrestricted(unrestrictedViews),
    models: [...options.values()],
    defaults: defaultsFor('standard'),
    unrestrictedDefaults: defaultsFor('unrestricted'),
    unrestrictedAllowlist: [...unrestricted],
    tiers: views.flatMap(({ costTier, contentMode, view }) => catalogGroupModels(view).map(model => ({ costTier, contentMode, ...model }))),
    modelLabels: catalogModelLabels(views.map(({ view }) => view)),
  };
}

export function labelMap(labels: readonly AiModelLabel[]): ReadonlyMap<string, string> {
  return new Map(labels.map(entry => [entry.model, entry.label]));
}

/** What novel-forge reads from Synapse's catalog: every model list, label and price, and whether unrestricted writing is routed. */
@Injectable()
export class NovelForgeCatalogService implements UnrestrictedAvailability {
  private readonly logger = Logger.getLogger(APP_NAME, NovelForgeCatalogService.name);

  constructor(private readonly synapse: SynapseClient) {}

  async selectionModels(selection: CatalogSelection): Promise<CatalogSelectionModels> {
    return { models: catalogGroupModels(await this.appView(selection)) };
  }

  /** Never fails: a catalog that cannot be read offers no unrestricted writing. Each tier's view rides the client's version-checked catalog cache. */
  async unrestrictedAvailable(): Promise<boolean> {
    try {
      return routesUnrestricted(await Promise.all(COST_TIERS.map(costTier => this.appView({ costTier, contentMode: 'unrestricted' }))));
    } catch (err) {
      this.logger.warn('Synapse catalog unreadable, so unrestricted writing is treated as unavailable', { err });
      return false;
    }
  }

  async modelsResponse(): Promise<AiModelsResponse> {
    const views = await Promise.all(CATALOG_SELECTIONS.map(async selection => ({ ...selection, view: await this.appView(selection) })));
    return catalogModelsResponse(views);
  }

  /** Never fails: a record whose model the catalog cannot name keeps its key, and an unreadable catalog leaves only the historical names. */
  async modelLabels(): Promise<ReadonlyMap<string, string>> {
    try {
      return labelMap(catalogModelLabels(await Promise.all(CATALOG_SELECTIONS.map(selection => this.appView(selection)))));
    } catch (err) {
      this.logger.warn('Synapse catalog unreadable, so recorded models keep their historical names or keys', { err });
      return labelMap(historicalLabels());
    }
  }

  private appView(selection: CatalogSelection): Promise<CatalogAppResponse> {
    return this.read(client => client.catalog({ selectors: synapseSelectors(selection) }));
  }

  private async read<T extends CatalogTaskView | CatalogAppResponse>(call: (client: SynapseClient) => Promise<T>): Promise<T> {
    try {
      return await call(this.synapse);
    } catch (err) {
      throw fromSynapseFailure(err);
    }
  }
}
