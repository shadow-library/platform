import {
  ALIAS_STATES,
  type AliasEntry,
  BUDGET_SCOPES,
  BUDGET_WINDOWS,
  type BudgetEntry,
  CAPABILITIES,
  DATA_POLICIES,
  EFFORTS,
  type ModelCapabilities,
  type ModelDeployment,
  type ModelEntry,
  type ModelPrice,
  PROVIDER_COSTS,
  PROVIDER_FEATURES,
  PROVIDER_FLAVORS,
  PROVIDER_KINDS,
  PROVIDER_LOCALITIES,
  type ProviderEntry,
  REASONING_MODES,
  TASK_KINDS,
  type TaskEffort,
  type TaskEntry,
  type TaskRoute,
} from './catalog-spec.types';
import { finite, isOneOf, isRecord, strings, text } from './catalog-values';

type CatalogDocument = Record<string, unknown>;

/** A task key is `<app>.<name>`, and only the app part is free of dots. */
export function splitTaskKey(key: string): { app: string; name: string } | null {
  const dot = key.indexOf('.');
  if (dot <= 0 || dot === key.length - 1) return null;
  return { app: key.slice(0, dot), name: key.slice(dot + 1) };
}

function entriesOf(section: unknown): [string, Record<string, unknown>][] {
  if (!isRecord(section)) return [];
  return Object.entries(section).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]));
}

/** `undefined` when absent, `null` when present but malformed: rewriting a malformed rule as a narrower or broader one would change who it matches. */
function availableOf(value: unknown): Record<string, string[]> | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, allowed]) => Array.isArray(allowed) && allowed.every(item => typeof item === 'string'))) return null;
  return Object.fromEntries(entries.map(([selector, allowed]) => [selector, strings(allowed)]));
}

function selectorsOf(value: unknown): Record<string, string> | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const pairs = Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === 'string');
  if (pairs.length !== Object.keys(value).length) return null;
  return pairs.length === 0 ? undefined : Object.fromEntries(pairs);
}

function effortOf(value: unknown): TaskEffort | undefined {
  if (!isRecord(value) || !isOneOf(EFFORTS, value.default)) return undefined;
  return { default: value.default, ...(isOneOf(EFFORTS, value.min) && { min: value.min }), ...(isOneOf(EFFORTS, value.max) && { max: value.max }) };
}

/** All or nothing: a task whose routes are written back without one malformed rule would lose or widen that rule. */
function routesOf(value: unknown): TaskRoute[] | null {
  if (!Array.isArray(value)) return null;
  const routes: TaskRoute[] = [];
  for (const route of value) {
    if (!isRecord(route) || typeof route.model !== 'string') return null;
    const when = selectorsOf(route.when);
    if (when === null) return null;
    routes.push({ ...(when && { when }), model: route.model });
  }
  return routes;
}

/** The document is `unknown` on the wire, so an entry that does not look like its kind is skipped rather than rendered half-empty. */
export function readTasks(document: CatalogDocument): TaskEntry[] {
  return entriesOf(document.tasks).flatMap(([key, value]): TaskEntry[] => {
    const parts = splitTaskKey(key);
    const routes = routesOf(value.routes);
    if (!parts || !routes || !isOneOf(TASK_KINDS, value.kind) || !isOneOf(DATA_POLICIES, value.dataPolicy)) return [];
    const label = text(value.label);
    const description = text(value.description);
    const effort = effortOf(value.effort);
    return [
      {
        key,
        ...parts,
        kind: value.kind,
        ...(label !== undefined && { label }),
        ...(description !== undefined && { description }),
        requires: strings(value.requires).filter(capability => isOneOf(CAPABILITIES, capability)),
        ...(effort && { effort }),
        dataPolicy: value.dataPolicy,
        aliases: strings(value.aliases),
        pinned: value.pinned === true,
        routes,
      },
    ];
  });
}

export function readAliases(document: CatalogDocument): AliasEntry[] {
  return entriesOf(document.aliases).flatMap(([key, value]): AliasEntry[] => {
    const model = text(value.model);
    const available = availableOf(value.available);
    if (!model || available === null || !isOneOf(ALIAS_STATES, value.state)) return [];
    const description = text(value.description);
    return [
      {
        key,
        label: text(value.label) ?? key,
        model,
        state: value.state,
        showVersion: value.showVersion === true,
        ...(description !== undefined && { description }),
        ...(available !== undefined && { available }),
      },
    ];
  });
}

function priceOf(value: unknown): ModelPrice | undefined {
  if (!isRecord(value)) return undefined;
  const input = finite(value.input);
  const output = finite(value.output);
  if (input === undefined || output === undefined) return undefined;
  const cachedInput = finite(value.cachedInput);
  const perImage = finite(value.perImage);
  return { input, output, ...(cachedInput !== undefined && { cachedInput }), ...(perImage !== undefined && { perImage }) };
}

/** Each flag is validated by the server on its own, so a missing one reads as its most conservative value rather than hiding the model. */
function capabilitiesOf(value: Record<string, unknown>): ModelCapabilities {
  const dimensions = isRecord(value.embedding) ? finite(value.embedding.dimensions) : undefined;
  const context = finite(value.context);
  const efforts = Array.isArray(value.efforts) ? value.efforts.filter(effort => isOneOf(EFFORTS, effort)) : undefined;
  return {
    tools: value.tools === true,
    structuredOutput: value.structuredOutput === 'native' ? 'native' : 'prompt',
    vision: value.vision === true,
    ...(value.imageOutput === true && { imageOutput: true }),
    ...(dimensions !== undefined && { embedding: { dimensions } }),
    ...(context !== undefined && { context }),
    reasoning: isOneOf(REASONING_MODES, value.reasoning) ? value.reasoning : 'none',
    ...(efforts !== undefined && { efforts }),
    promptCache: value.promptCache === 'anthropic' ? 'anthropic' : 'none',
    sampling: value.sampling === true,
  };
}

function deploymentsOf(value: unknown[]): ModelDeployment[] {
  return value.flatMap((deployment): ModelDeployment[] =>
    isRecord(deployment) && typeof deployment.provider === 'string' && typeof deployment.id === 'string' ? [{ provider: deployment.provider, id: deployment.id }] : [],
  );
}

export function readModels(document: CatalogDocument): ModelEntry[] {
  return entriesOf(document.models).flatMap(([key, value]): ModelEntry[] => {
    const pricePerMTok = priceOf(value.pricePerMTok);
    if (!pricePerMTok || !isRecord(value.capabilities) || !Array.isArray(value.deployments)) return [];
    const version = text(value.version);
    return [
      {
        key,
        label: text(value.label) ?? key,
        ...(version !== undefined && { version }),
        capabilities: capabilitiesOf(value.capabilities),
        pricePerMTok,
        deployments: deploymentsOf(value.deployments),
      },
    ];
  });
}

export function readProviders(document: CatalogDocument): ProviderEntry[] {
  return entriesOf(document.providers).map(([key, value]): ProviderEntry => {
    const credential = text(value.credential);
    const apiKeyConfig = text(value.apiKeyConfig);
    const maxInflightPerReplica = finite(value.maxInflightPerReplica);
    return {
      key,
      ...(isOneOf(PROVIDER_KINDS, value.kind) && { kind: value.kind }),
      ...(isOneOf(PROVIDER_FLAVORS, value.flavor) && { flavor: value.flavor }),
      url: text(value.url) ?? '',
      ...(credential !== undefined && { credential }),
      ...(apiKeyConfig !== undefined && { apiKeyConfig }),
      ...(isOneOf(PROVIDER_LOCALITIES, value.locality) && { locality: value.locality }),
      ...(isOneOf(PROVIDER_COSTS, value.cost) && { cost: value.cost }),
      features: strings(value.features).filter(feature => isOneOf(PROVIDER_FEATURES, feature)),
      ...(maxInflightPerReplica !== undefined && { maxInflightPerReplica }),
    };
  });
}

export function readBudgets(document: CatalogDocument): BudgetEntry[] {
  if (!Array.isArray(document.budgets)) return [];
  return document.budgets.flatMap((value: unknown, index): BudgetEntry[] => {
    if (!isRecord(value) || typeof value.app !== 'string' || !isOneOf(BUDGET_SCOPES, value.per) || !isOneOf(BUDGET_WINDOWS, value.window)) return [];
    const maxCalls = finite(value.maxCalls);
    const maxListCostUsd = finite(value.maxListCostUsd);
    return [
      {
        index,
        app: value.app,
        per: value.per,
        window: value.window,
        ...(maxCalls !== undefined && { maxCalls }),
        ...(maxListCostUsd !== undefined && { maxListCostUsd }),
      },
    ];
  });
}

export function selectorVocabulary(document: CatalogDocument): Record<string, string[]> {
  const vocabulary = new Map<string, Set<string>>();
  const add = (selector: string, values: readonly string[]): void => {
    const known = vocabulary.get(selector) ?? new Set<string>();
    for (const value of values) known.add(value);
    vocabulary.set(selector, known);
  };
  for (const task of readTasks(document)) for (const route of task.routes) for (const [selector, value] of Object.entries(route.when ?? {})) add(selector, [value]);
  for (const alias of readAliases(document)) for (const [selector, values] of Object.entries(alias.available ?? {})) add(selector, values);
  const sorted = [...vocabulary.entries()].sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(sorted.map(([selector, values]) => [selector, [...values].sort((left, right) => left.localeCompare(right))]));
}
