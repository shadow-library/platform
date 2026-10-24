import { describeChanges } from '@/features/catalog/catalog-changes';
import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { readAliases, readModels, readTasks } from '@/features/catalog/catalog-readers';
import { type Effort, type ModelPrice, type TaskEntry, type TaskKind } from '@/features/catalog/catalog-spec.types';
import { modelDisplayName } from '@/features/shared/model-options';
import { aliasName, appName, taskName } from '@/features/shared/naming';
import { type UsageRowResponse } from '@/lib/apis/api-types.gen';

export interface NamedRef {
  key: string;
  name: string;
}

export interface DefaultModel extends NamedRef {
  /** Absent when the route names a model the catalog lacks */
  price?: ModelPrice;
}

export interface FeatureSpend {
  billed: number;
  list: number;
}

export interface FeatureSummary {
  key: string;
  name: string;
  description?: string;
  kind: TaskKind;
  pinned: boolean;
  defaultModel: DefaultModel | null;
  extraRules: number;
  effort?: Effort;
  aliases: NamedRef[];
  unpublished: boolean;
  /** Absent while usage is unknown: not loaded, failed, or not readable by this user */
  spend?: FeatureSpend;
}

export interface FeatureGroup {
  app: string;
  name: string;
  features: FeatureSummary[];
}

/** With no draft nothing is unpublished; with no active version every task in the draft is. */
export function changedTaskKeys(active: CatalogDocument | null, draft: CatalogDocument | null): Set<string> {
  if (!draft) return new Set();
  return new Set(
    describeChanges(active, draft)
      .filter(change => change.area === 'task')
      .map(change => change.entityKey),
  );
}

export function defaultRouteOf(task: Pick<TaskEntry, 'routes'>): TaskEntry['routes'][number] | undefined {
  return task.routes.find(route => Object.keys(route.when ?? {}).length === 0);
}

/** Usage counts every settled call; a task with no row in the window spent nothing. */
export function buildFeatureGroups(document: CatalogDocument, changed: ReadonlySet<string>, usage: readonly UsageRowResponse[] | null): FeatureGroup[] {
  const models = new Map(readModels(document).map(model => [model.key, model]));
  const aliases = new Map(readAliases(document).map(alias => [alias.key, alias]));
  const spendByTask = new Map((usage ?? []).flatMap(row => (row.key === null ? [] : [[row.key, { billed: row.billedCostUsd, list: row.listCostUsd }] as const])));
  const groups = new Map<string, FeatureSummary[]>();

  for (const task of readTasks(document)) {
    const fallback = defaultRouteOf(task);
    const model = fallback ? models.get(fallback.model) : undefined;
    const summary: FeatureSummary = {
      key: task.key,
      name: taskName(task),
      ...(task.description !== undefined && { description: task.description }),
      kind: task.kind,
      pinned: task.pinned,
      defaultModel: fallback ? { key: fallback.model, name: model ? modelDisplayName(model) : fallback.model, ...(model && { price: model.pricePerMTok }) } : null,
      extraRules: task.routes.length - (fallback ? 1 : 0),
      ...(task.effort && { effort: task.effort.default }),
      aliases: task.aliases.map(key => ({ key, name: aliasName({ key, label: aliases.get(key)?.label }) })),
      unpublished: changed.has(task.key),
      ...(usage && { spend: spendByTask.get(task.key) ?? { billed: 0, list: 0 } }),
    };
    groups.set(task.app, [...(groups.get(task.app) ?? []), summary]);
  }

  return [...groups.entries()]
    .map(([app, features]) => ({ app, name: appName(app), features: features.sort((left, right) => left.name.localeCompare(right.name)) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
