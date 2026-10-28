import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

import {
  type AliasSpec,
  type CatalogDocument,
  compareEffort,
  type Effort,
  type ModelSpec,
  modelSupports,
  type ProviderSpec,
  type Selectors,
  type TaskRoute,
  type TaskSpec,
} from './catalog.types';
import { ownEntry } from './catalog.utils';

export interface ResolveNeeds {
  tools?: boolean;
  vision?: boolean;
  streaming?: boolean;
}

export interface ResolveRequest {
  app: string;
  task: string;
  selectors?: Selectors;
  strict?: readonly string[];
  alias?: string;
  needs?: ResolveNeeds;
}

export interface ResolvedAlias {
  key: string;
  spec: AliasSpec;
}

export interface ResolvedDeployment {
  providerKey: string;
  provider: ProviderSpec;
  id: string;
}

export interface Resolution {
  taskKey: string;
  task: TaskSpec;
  /** Absent when no alias was named, or the named one is retired and the routes answered instead */
  alias?: ResolvedAlias;
  modelKey: string;
  model: ModelSpec;
  /** Failover order, already filtered by the data policy and the request's needs */
  deployments: ResolvedDeployment[];
}

export function isAliasAvailable(alias: AliasSpec, selectors: Selectors): boolean {
  if (!alias.available) return true;
  return Object.entries(alias.available).every(([key, values]) => Object.hasOwn(selectors, key) && values.includes(selectors[key] as string));
}

function aliasHonoursStrict(alias: AliasSpec, selectors: Selectors, strict: readonly string[]): boolean {
  return strict.every(key => Object.hasOwn(selectors, key) && (ownEntry(alias.available ?? {}, key)?.includes(selectors[key] as string) ?? false));
}

function routeHonoursStrict(route: TaskRoute, strict: readonly string[]): boolean {
  return strict.every(key => Object.hasOwn(route.when ?? {}, key));
}

/** The route matching the most selector keys wins, ties going to the earliest; the default route matches with zero keys. */
export function selectRoute(task: TaskSpec, selectors: Selectors): TaskRoute | undefined {
  let selected: TaskRoute | undefined;
  let selectedKeys = -1;
  for (const route of task.routes) {
    const when = route.when ?? {};
    const keys = Object.keys(when);
    const matches = keys.every(key => Object.hasOwn(selectors, key) && selectors[key] === when[key]);
    if (matches && keys.length > selectedKeys) {
      selected = route;
      selectedKeys = keys.length;
    }
  }
  return selected;
}

/** The subscription gateway takes image parts only when it declares `image_input`; every other provider follows the model's own vision capability. */
function deploymentServes(provider: ProviderSpec, task: TaskSpec, needs: ResolveNeeds): boolean {
  if (task.dataPolicy === 'in_cluster_only' && provider.locality !== 'in_cluster') return false;
  if (needs.vision && provider.flavor === 'subscription-gateway' && !provider.features?.includes('image_input')) return false;
  return true;
}

export function eligibleDeployments(document: CatalogDocument, task: TaskSpec, model: ModelSpec, needs: ResolveNeeds = {}): ResolvedDeployment[] {
  const deployments: ResolvedDeployment[] = [];
  for (const deployment of model.deployments) {
    const provider = ownEntry(document.providers, deployment.provider);
    if (!provider) throw AppError.internal(`Catalog deployment names unknown provider '${deployment.provider}'`);
    if (deploymentServes(provider, task, needs)) deployments.push({ providerKey: deployment.provider, provider, id: deployment.id });
  }
  return deployments;
}

function modelMeetsNeeds(model: ModelSpec, needs: ResolveNeeds): boolean {
  if (needs.tools && !modelSupports(model, 'tools')) return false;
  if (needs.vision && !modelSupports(model, 'vision')) return false;
  if (needs.streaming && !modelSupports(model, 'streaming')) return false;
  return true;
}

/**
 * A retired alias, or one whose `available` rule does not name every strict value, resolves to `undefined` so the routes answer instead; any other
 * unusable alias is refused, never relaxed to the routes.
 */
function resolveAlias(document: CatalogDocument, taskKey: string, task: TaskSpec, aliasKey: string, selectors: Selectors, strict: readonly string[]): ResolvedAlias | undefined {
  const alias = ownEntry(document.aliases, aliasKey);
  if (alias?.state === 'retired') return undefined;
  if (alias && !aliasHonoursStrict(alias, selectors, strict)) return undefined;
  const listed = task.aliases?.includes(aliasKey) ?? false;
  if (!alias || !listed || !isAliasAvailable(alias, selectors)) throw AppErrorCode.SYN_ALIAS_UNAVAILABLE.create({ alias: aliasKey, task: taskKey });
  return { key: aliasKey, spec: alias };
}

/** Strict keys are checked on the route the selectors choose, never used to pick another one: a strict call that would fall short is refused. */
function routeModel(taskKey: string, task: TaskSpec, selectors: Selectors, strict: readonly string[]): string {
  const route = selectRoute(task, selectors);
  if (!route) throw AppErrorCode.SYN_NO_ELIGIBLE_MODEL.create({ task: taskKey });
  if (!routeHonoursStrict(route, strict)) throw AppErrorCode.SYN_NO_ELIGIBLE_MODEL.create({ task: taskKey, strict: [...strict] });
  return route.model;
}

/** The prefix is checked before existence, so a caller cannot probe which of another app's tasks exist. */
export function resolve(document: CatalogDocument, request: ResolveRequest): Resolution {
  const { app, task: taskKey, selectors = {}, strict = [], needs = {} } = request;
  if (!taskKey.startsWith(`${app}.`)) throw AppErrorCode.SYN_TASK_FORBIDDEN.create({ task: taskKey });
  const task = ownEntry(document.tasks, taskKey);
  if (!task) throw AppErrorCode.SYN_UNKNOWN_TASK.create({ task: taskKey });

  const alias = request.alias === undefined ? undefined : resolveAlias(document, taskKey, task, request.alias, selectors, strict);
  const modelKey = alias?.spec.model ?? routeModel(taskKey, task, selectors, strict);
  const model = ownEntry(document.models, modelKey);
  if (!model) throw AppError.internal(`Catalog task '${taskKey}' names unknown model '${modelKey}'`);
  if (!modelMeetsNeeds(model, needs)) throw AppErrorCode.SYN_NO_ELIGIBLE_MODEL.create({ task: taskKey, model: modelKey });

  const deployments = eligibleDeployments(document, task, model, needs);
  if (deployments.length === 0) throw AppErrorCode.SYN_NO_ELIGIBLE_MODEL.create({ task: taskKey, model: modelKey });
  return { taskKey, task, alias, modelKey, model, deployments };
}

export function labelFor(alias: AliasSpec | undefined, model: ModelSpec): string {
  if (!alias) return model.label;
  return alias.showVersion && model.version ? `${alias.label} ${model.version}` : alias.label;
}

/**
 * Clamps to the task's range, then sends the effort only if the model lists it. Otherwise an optional model reasons not at all and a mandatory one at
 * its lowest supported effort, as novel-forge resolves it today. `undefined` means no reasoning field is sent.
 */
export function clampEffort(task: TaskSpec, model: ModelSpec, requested?: Effort): Effort | undefined {
  const { reasoning, efforts = [] } = model.capabilities;
  if (reasoning === 'none') return undefined;
  const wanted = requested ?? task.effort?.default;
  if (wanted === undefined) return undefined;

  const { min, max } = task.effort ?? {};
  let clamped = wanted;
  if (min !== undefined && compareEffort(clamped, min) < 0) clamped = min;
  if (max !== undefined && compareEffort(clamped, max) > 0) clamped = max;

  if (reasoning === 'optional') return efforts.includes(clamped) ? clamped : undefined;
  if (efforts.includes(clamped)) return clamped;
  return [...efforts].sort(compareEffort)[0];
}
