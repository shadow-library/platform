import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { type CatalogAliasView, type CatalogAppResponse, type CatalogModelView, type CatalogTaskResponse, type CatalogTaskView, SynapseClient } from '@shadow-library/synapse';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Project } from '@server/database';

import { type AiModelLabel, type AiModelOption, type AiModelsResponse, type AiRoleDefault } from './ai.dto';
import { isSynapseBackend } from './ai-backend';
import { CONTENT_MODES, COST_TIERS, DEFAULT_COST_TIER, SELECTABLE_MODEL_GROUPS, type SelectableModelGroup } from './defaults';
import { MODEL_REGISTRY } from './models';
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
  /** The chat aliases the catalog offers for exactly this selection, as option ids. */
  chatAliases: string[];
}

interface SelectionView extends CatalogSelection {
  view: CatalogAppResponse;
}

export const CATALOG_SELECTIONS: readonly CatalogSelection[] = COST_TIERS.flatMap(costTier => CONTENT_MODES.map(contentMode => ({ costTier, contentMode })));

/** An image model is priced per image, so it carries no per-token price, as the registry's image entries never did. */
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

function registryLabels(): AiModelLabel[] {
  return MODEL_REGISTRY.map(entry => ({
    model: entry.id,
    label: entry.kind === 'embedding' ? entry.id : entry.label,
    ...(entry.inputPricePerMToken !== undefined && { inputPricePerMToken: entry.inputPricePerMToken }),
    ...(entry.outputPricePerMToken !== undefined && { outputPricePerMToken: entry.outputPricePerMToken }),
  }));
}

/**
 * Names for every model key a record may hold: the registry's for rows written before Synapse, then each alias's for its target, then the
 * model's own label wherever a task routes to it, which wins because it is the label Synapse gives a call no alias chose.
 */
export function catalogModelLabels(views: readonly CatalogAppResponse[]): AiModelLabel[] {
  const labels = new Map(registryLabels().map(entry => [entry.model, entry]));
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
  return {
    profile: 'production',
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

/** What novel-forge reads from Synapse's catalog on the Synapse backend: every model list, label, price and pinnable alias. */
@Injectable()
export class NovelForgeCatalogService {
  private readonly logger = Logger.getLogger(APP_NAME, NovelForgeCatalogService.name);

  constructor(private readonly synapse?: SynapseClient) {}

  async chatTask(selection: CatalogSelection): Promise<CatalogTaskResponse> {
    return this.read(client => client.catalog({ task: SYNAPSE_CHAT_TASK, selectors: synapseSelectors(selection) }));
  }

  async selectionModels(selection: CatalogSelection): Promise<CatalogSelectionModels> {
    const view = await this.appView(selection);
    return { models: catalogGroupModels(view), chatAliases: chatAliasesOf(view).map(alias => alias.key) };
  }

  async modelsResponse(): Promise<AiModelsResponse> {
    const views = await Promise.all(CATALOG_SELECTIONS.map(async selection => ({ ...selection, view: await this.appView(selection) })));
    return catalogModelsResponse(views);
  }

  /** The alias as the catalog offers it for these selectors; anything it does not offer, hidden and retired aliases included, cannot be pinned. */
  async requireChatAlias(alias: string, selection: CatalogSelection): Promise<CatalogAliasView> {
    const offered = (await this.chatTask(selection)).aliases.find(entry => entry.key === alias);
    if (!offered) throw AppErrorCode.AI_022.create({ alias });
    return offered;
  }

  /** `undefined` when the catalog cannot be read, so the caller sends the pin as stored and lets Synapse decide. */
  async offeredChatAliases(selection: CatalogSelection): Promise<string[] | undefined> {
    try {
      return (await this.chatTask(selection)).aliases.map(alias => alias.key);
    } catch (err) {
      this.logger.warn('Synapse catalog unreadable, so a chat pin is sent unchecked', { selection, err });
      return undefined;
    }
  }

  /** Never fails: a record whose model the catalog cannot name keeps its key, and an unreadable catalog leaves the registry's names alone. */
  async modelLabels(): Promise<ReadonlyMap<string, string>> {
    if (!isSynapseBackend()) return labelMap(registryLabels());
    try {
      return labelMap(catalogModelLabels(await Promise.all(CATALOG_SELECTIONS.map(selection => this.appView(selection)))));
    } catch (err) {
      this.logger.warn('Synapse catalog unreadable, so recorded models keep their registry names or keys', { err });
      return labelMap(registryLabels());
    }
  }

  private appView(selection: CatalogSelection): Promise<CatalogAppResponse> {
    return this.read(client => client.catalog({ selectors: synapseSelectors(selection) }));
  }

  private async read<T extends CatalogTaskView | CatalogAppResponse>(call: (client: SynapseClient) => Promise<T>): Promise<T> {
    if (!this.synapse) throw AppErrorCode.AI_007.create({ transient: true });
    try {
      return await call(this.synapse);
    } catch (err) {
      throw fromSynapseFailure(err);
    }
  }
}
