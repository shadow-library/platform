import { formatNumber, formatPrice, formatUsd } from '@/features/shared/format';
import {
  aliasName,
  appName,
  capabilityName,
  dataPolicyName,
  effortName,
  modelName,
  providerName,
  scopeName,
  selectorName,
  sentenceCase,
  taskKindName,
  taskName,
  taskTitle,
  titleCase,
  windowName,
} from '@/features/shared/naming';

import { type CatalogDocument } from './catalog-document';
import { rawWebSearch, readAliases, readBudgets, readModels, readProviders, readTasks, readWebSearch, splitTaskKey } from './catalog-readers';
import {
  type AliasEntry,
  type BudgetEntry,
  ENTRY_FIELDS,
  type KeyedSection,
  type ModelEntry,
  type ProviderEntry,
  type TaskEntry,
  type TaskRoute,
  WEB_SEARCH_FIELDS,
  type WebSearchSpec,
} from './catalog-spec.types';
import { isRecord, isSameValue, ownEntry } from './catalog-values';

export type ChangeArea = 'budget' | 'task' | 'alias' | 'model' | 'provider' | 'tool' | 'other';

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface CatalogChange {
  area: ChangeArea;
  /** The catalog key; for a budget, `budgetKeyOf`'s key, which `issueOwner` also returns */
  entityKey: string;
  entityLabel: string;
  kind: ChangeKind;
  /** Absent when the whole entity was added or removed */
  field?: string;
  before?: string;
  after?: string;
  sentence: string;
}

interface Entity {
  area: ChangeArea;
  key: string;
  label: string;
}

interface Names {
  model: (key: string) => string;
  alias: (key: string) => string;
}

const NONE = 'none';
const NOT_SET = 'not set';
const NO_LIMIT = 'no limit';
const ARROW = '→';

const SECTIONS: readonly string[] = ['providers', 'models', 'aliases', 'tasks', 'budgets', 'tools'];

const WEB_SEARCH_KEY = 'webSearch';

const PROVIDER_KIND_NAMES: Readonly<Record<string, string>> = { openai: 'OpenAI-compatible', ollama: 'Ollama', mock: 'Mock' };
const LOCALITY_NAMES: Readonly<Record<string, string>> = { in_cluster: 'In our cluster', host: 'On the host', third_party: 'Third party' };
const COST_NAMES: Readonly<Record<string, string>> = { zero: 'Free', metered: 'Metered' };
const REASONING_NAMES: Readonly<Record<string, string>> = { none: 'None', optional: 'Optional', mandatory: 'Always on' };
const SEARCH_ENGINE_NAMES: Readonly<Record<string, string>> = { brave: 'Brave Search', mock: 'Test stand-in' };

const yesNo = (value: boolean | undefined): string => (value ? 'Yes' : 'No');
const named = (names: Readonly<Record<string, string>>, value: string | undefined): string => (value === undefined ? NOT_SET : (ownEntry(names, value) ?? sentenceCase(value)));
const listOf = (values: readonly string[]): string => (values.length === 0 ? NONE : values.join(', '));
const usdOr = (value: number | undefined, absent: string): string => (value === undefined ? absent : formatUsd(value));

export function describeWhen(when: Record<string, string> | undefined): string {
  const pairs = Object.entries(when ?? {});
  if (pairs.length === 0) return 'Everyone else';
  return `When ${pairs.map(([selector, value]) => `${selectorName(selector).toLowerCase()} is ${value}`).join(' and ')}`;
}

function describeAvailableWords(available: Record<string, string[]> | undefined): string {
  const pairs = Object.entries(available ?? {});
  if (pairs.length === 0) return 'everywhere';
  return `when ${pairs.map(([selector, values]) => `${selectorName(selector).toLowerCase()} is ${values.join(' or ')}`).join(' and ')}`;
}

/** Budgets have no key, so one is made of what identifies them; budgets that share it are told apart by their order. */
export function budgetKeyOf(budgets: readonly BudgetEntry[], budget: BudgetEntry): string {
  const base = `${budget.app}/${budget.per}/${budget.window}`;
  const ordinal = budgets.filter(other => other.index < budget.index && other.app === budget.app && other.per === budget.per && other.window === budget.window).length;
  return ordinal === 0 ? base : `${base}#${ordinal + 1}`;
}

export function budgetLabel(budget: Pick<BudgetEntry, 'app' | 'per' | 'window'>): string {
  return `Budget for ${appName(budget.app)}, ${scopeName(budget.per)}, ${windowName(budget.window)}`;
}

function fieldChange(entity: Entity, field: string, fieldLabel: string, before: string, after: string, unit = ''): CatalogChange {
  return {
    area: entity.area,
    entityKey: entity.key,
    entityLabel: entity.label,
    kind: 'changed',
    field,
    before,
    after,
    sentence: `${entity.label} — ${fieldLabel}: ${before} ${ARROW} ${after}${unit}`,
  };
}

function compare(entity: Entity, field: string, fieldLabel: string, before: string, after: string, unit = ''): CatalogChange[] {
  return before === after ? [] : [fieldChange(entity, field, fieldLabel, before, after, unit)];
}

function comparePrice(entity: Entity, field: string, fieldLabel: string, before: number | undefined, after: number | undefined, unit: string): CatalogChange[] {
  if (before === after) return [];
  const shown = (price: number | undefined): string => (price === undefined ? NOT_SET : formatPrice(price));
  return [fieldChange(entity, field, fieldLabel, shown(before), shown(after), unit)];
}

/** Compares the keys an entity references, so renaming the referenced entity is not reported here as well. */
function compareRefs(
  entity: Entity,
  field: string,
  fieldLabel: string,
  before: readonly string[],
  after: readonly string[],
  names: { before: (key: string) => string; after: (key: string) => string },
): CatalogChange[] {
  if (before.length === after.length && before.every((key, index) => key === after[index])) return [];
  return [fieldChange(entity, field, fieldLabel, listOf(before.map(names.before)), listOf(after.map(names.after)))];
}

function textChange(entity: Entity, field: string, fieldLabel: string, before: string | undefined, after: string | undefined): CatalogChange[] {
  if ((before ?? '') === (after ?? '')) return [];
  const verb = !before ? 'added' : !after ? 'removed' : 'updated';
  return [{ ...fieldChange(entity, field, fieldLabel, before ?? NONE, after ?? NONE), sentence: `${entity.label} — ${fieldLabel} ${verb}` }];
}

/** Credential ids are opaque, so the values carried are whether a stored key is named, never the id. */
function credentialChange(entity: Entity, before: string | undefined, after: string | undefined): CatalogChange[] {
  if (before === after) return [];
  const verb = !before ? 'set' : !after ? 'removed' : 'replaced';
  const shown = (credential: string | undefined): string => (credential ? 'stored key' : NONE);
  return [{ ...fieldChange(entity, 'credential', 'API key', shown(before), shown(after)), sentence: `${entity.label} — API key ${verb}` }];
}

function wholeChange(entity: Entity, kind: 'added' | 'removed', detail = ''): CatalogChange {
  return { area: entity.area, entityKey: entity.key, entityLabel: entity.label, kind, sentence: `${entity.label} — ${kind}${detail}` };
}

function ruleChange(entity: Entity, kind: 'added' | 'removed', route: TaskRoute, model: string): CatalogChange {
  const rule = `${describeWhen(route.when)} ${ARROW} ${model}`;
  return {
    area: entity.area,
    entityKey: entity.key,
    entityLabel: entity.label,
    kind,
    field: 'routes.rule',
    ...(kind === 'added' ? { after: rule } : { before: rule }),
    sentence: `${entity.label} — rule ${kind}: ${rule}`,
  };
}

const ruleSignature = (route: TaskRoute): string => JSON.stringify(Object.entries(route.when ?? {}).sort(([left], [right]) => left.localeCompare(right)));

function routeChanges(entity: Entity, before: readonly TaskRoute[], after: readonly TaskRoute[], names: { before: Names; after: Names }): CatalogChange[] {
  const isDefault = (route: TaskRoute): boolean => Object.keys(route.when ?? {}).length === 0;
  const defaultBefore = before.find(isDefault);
  const defaultAfter = after.find(isDefault);
  const models = { before: names.before.model, after: names.after.model };
  const changes = compareRefs(entity, 'routes.default', 'default model', defaultBefore ? [defaultBefore.model] : [], defaultAfter ? [defaultAfter.model] : [], models);

  const candidates = before.map((route, index) => ({ route, index })).filter(candidate => !isDefault(candidate.route));
  const paired = new Set<number>();
  const pairedInOrder: number[] = [];
  for (const route of after.filter(rule => !isDefault(rule))) {
    const match = candidates.find(candidate => !paired.has(candidate.index) && ruleSignature(candidate.route) === ruleSignature(route));
    if (!match) {
      changes.push(ruleChange(entity, 'added', route, names.after.model(route.model)));
      continue;
    }
    paired.add(match.index);
    pairedInOrder.push(match.index);
    changes.push(...compareRefs(entity, 'routes.rule', describeWhen(route.when), [match.route.model], [route.model], models));
  }
  for (const candidate of candidates) if (!paired.has(candidate.index)) changes.push(ruleChange(entity, 'removed', candidate.route, names.before.model(candidate.route.model)));

  const reordered = pairedInOrder.some((index, position) => index < (pairedInOrder[position - 1] ?? -1));
  if (reordered)
    changes.push({ area: entity.area, entityKey: entity.key, entityLabel: entity.label, kind: 'changed', field: 'routes.order', sentence: `${entity.label} — rule order changed` });
  return changes;
}

function taskFieldChanges(entity: Entity, before: TaskEntry, after: TaskEntry, names: { before: Names; after: Names }): CatalogChange[] {
  const efforts = (task: TaskEntry, part: 'default' | 'min' | 'max'): string => {
    const effort = task.effort?.[part];
    return effort === undefined ? NOT_SET : effortName(effort);
  };
  return [
    ...compare(entity, 'label', 'name', taskName(before), taskName(after)),
    ...textChange(entity, 'description', 'description', before.description, after.description),
    ...compare(entity, 'kind', 'kind', taskKindName(before.kind), taskKindName(after.kind)),
    ...compare(entity, 'requires', 'required capabilities', listOf(before.requires.map(capabilityName)), listOf(after.requires.map(capabilityName))),
    ...routeChanges(entity, before.routes, after.routes, names),
    ...compare(entity, 'effort.default', 'default effort', efforts(before, 'default'), efforts(after, 'default')),
    ...compare(entity, 'effort.min', 'lowest effort', efforts(before, 'min'), efforts(after, 'min')),
    ...compare(entity, 'effort.max', 'highest effort', efforts(before, 'max'), efforts(after, 'max')),
    ...compareRefs(entity, 'aliases', 'model names offered', before.aliases, after.aliases, { before: names.before.alias, after: names.after.alias }),
    ...compare(entity, 'dataPolicy', 'data policy', dataPolicyName(before.dataPolicy), dataPolicyName(after.dataPolicy)),
    ...compare(entity, 'pinned', 'pinned', yesNo(before.pinned), yesNo(after.pinned)),
  ];
}

function aliasFieldChanges(entity: Entity, before: AliasEntry, after: AliasEntry, names: { before: Names; after: Names }): CatalogChange[] {
  return [
    ...compareRefs(entity, 'model', 'points to', [before.model], [after.model], { before: names.before.model, after: names.after.model }),
    ...compare(entity, 'label', 'name', before.label, after.label),
    ...textChange(entity, 'description', 'description', before.description, after.description),
    ...compare(entity, 'state', 'state', sentenceCase(before.state), sentenceCase(after.state)),
    ...compare(entity, 'showVersion', 'shows version', yesNo(before.showVersion), yesNo(after.showVersion)),
    ...compare(entity, 'available', 'offered', describeAvailableWords(before.available), describeAvailableWords(after.available)),
  ];
}

function modelFieldChanges(entity: Entity, before: ModelEntry, after: ModelEntry): CatalogChange[] {
  const left = before.capabilities;
  const right = after.capabilities;
  const perMTok = ' per million tokens';
  const dimensions = (model: ModelEntry): string => (model.capabilities.embedding ? `${formatNumber(model.capabilities.embedding.dimensions)} dimensions` : NONE);
  const context = (model: ModelEntry): string => (model.capabilities.context === undefined ? NOT_SET : `${formatNumber(model.capabilities.context)} tokens`);
  const efforts = (model: ModelEntry): string => (model.capabilities.efforts ? listOf(model.capabilities.efforts.map(effortName)) : NOT_SET);
  const servedBy = (model: ModelEntry): string => listOf(model.deployments.map(deployment => providerName(deployment.provider)));
  const deploymentIds = (model: ModelEntry): string => model.deployments.map(deployment => `${deployment.provider}:${deployment.id}`).join(', ');
  const servedByChanges = compare(entity, 'deployments', 'served by', servedBy(before), servedBy(after));
  const idChanged = servedByChanges.length === 0 && deploymentIds(before) !== deploymentIds(after);
  return [
    ...compare(entity, 'label', 'name', before.label, after.label),
    ...compare(entity, 'version', 'version', before.version ?? NOT_SET, after.version ?? NOT_SET),
    ...comparePrice(entity, 'pricePerMTok.input', 'input price', before.pricePerMTok.input, after.pricePerMTok.input, perMTok),
    ...comparePrice(entity, 'pricePerMTok.cachedInput', 'cached input price', before.pricePerMTok.cachedInput, after.pricePerMTok.cachedInput, perMTok),
    ...comparePrice(entity, 'pricePerMTok.output', 'output price', before.pricePerMTok.output, after.pricePerMTok.output, perMTok),
    ...comparePrice(entity, 'pricePerMTok.perImage', 'image price', before.pricePerMTok.perImage, after.pricePerMTok.perImage, ' per image'),
    ...compare(entity, 'capabilities.tools', 'tools', yesNo(left.tools), yesNo(right.tools)),
    ...compare(entity, 'capabilities.structuredOutput', 'structured output', sentenceCase(left.structuredOutput), sentenceCase(right.structuredOutput)),
    ...compare(entity, 'capabilities.vision', 'vision', yesNo(left.vision), yesNo(right.vision)),
    ...compare(entity, 'capabilities.imageOutput', 'image output', yesNo(left.imageOutput), yesNo(right.imageOutput)),
    ...compare(entity, 'capabilities.embedding', 'embedding size', dimensions(before), dimensions(after)),
    ...compare(entity, 'capabilities.context', 'context window', context(before), context(after)),
    ...compare(entity, 'capabilities.reasoning', 'reasoning', named(REASONING_NAMES, left.reasoning), named(REASONING_NAMES, right.reasoning)),
    ...compare(entity, 'capabilities.efforts', 'supported efforts', efforts(before), efforts(after)),
    ...compare(entity, 'capabilities.promptCache', 'prompt caching', yesNo(left.promptCache === 'anthropic'), yesNo(right.promptCache === 'anthropic')),
    ...compare(entity, 'capabilities.sampling', 'sampling controls', yesNo(left.sampling), yesNo(right.sampling)),
    ...servedByChanges,
    ...(idChanged
      ? [{ ...fieldChange(entity, 'deployments.id', 'provider model id', deploymentIds(before), deploymentIds(after)), sentence: `${entity.label} — provider model id changed` }]
      : []),
  ];
}

function providerFieldChanges(entity: Entity, before: ProviderEntry, after: ProviderEntry): CatalogChange[] {
  const limit = (provider: ProviderEntry): string => (provider.maxInflightPerReplica === undefined ? NO_LIMIT : formatNumber(provider.maxInflightPerReplica));
  return [
    ...compare(entity, 'kind', 'type', named(PROVIDER_KIND_NAMES, before.kind), named(PROVIDER_KIND_NAMES, after.kind)),
    ...compare(entity, 'flavor', 'API flavour', before.flavor ? titleCase(before.flavor) : NOT_SET, after.flavor ? titleCase(after.flavor) : NOT_SET),
    ...compare(entity, 'url', 'address', before.url || NOT_SET, after.url || NOT_SET),
    ...credentialChange(entity, before.credential, after.credential),
    ...textChange(entity, 'apiKeyConfig', 'legacy key setting', before.apiKeyConfig, after.apiKeyConfig),
    ...compare(entity, 'locality', 'runs', named(LOCALITY_NAMES, before.locality), named(LOCALITY_NAMES, after.locality)),
    ...compare(entity, 'cost', 'cost', named(COST_NAMES, before.cost), named(COST_NAMES, after.cost)),
    ...compare(entity, 'features', 'features', listOf(before.features.map(sentenceCase)), listOf(after.features.map(sentenceCase))),
    ...compare(entity, 'maxInflightPerReplica', 'concurrent call limit', limit(before), limit(after)),
  ];
}

interface SectionPlan<T> {
  section: KeyedSection;
  area: ChangeArea;
  read: (document: CatalogDocument) => (T & { key: string })[];
  label: (key: string, entry?: T) => string;
  fields: (entity: Entity, before: T, after: T) => CatalogChange[];
  addedDetail?: (entry: T) => string;
}

function rawSection(document: CatalogDocument | null, section: KeyedSection): Record<string, unknown> {
  const value = document?.[section];
  return isRecord(value) ? value : {};
}

/** Each entity present on both sides is compared field by field; whatever the readers cannot see still surfaces as an unnamed change. */
function diffSection<T>(before: CatalogDocument | null, after: CatalogDocument, plan: SectionPlan<T>): CatalogChange[] {
  const rawBefore = rawSection(before, plan.section);
  const rawAfter = rawSection(after, plan.section);
  const readBefore = new Map((before ? plan.read(before) : []).map(entry => [entry.key, entry]));
  const readAfter = new Map(plan.read(after).map(entry => [entry.key, entry]));
  const keys = [...new Set([...Object.keys(rawAfter), ...Object.keys(rawBefore)])];

  return keys.flatMap((key): CatalogChange[] => {
    const left = readBefore.get(key);
    const right = readAfter.get(key);
    const entity: Entity = { area: plan.area, key, label: plan.label(key, right ?? left) };
    if (!Object.hasOwn(rawAfter, key)) return [wholeChange(entity, 'removed')];
    if (!Object.hasOwn(rawBefore, key)) return [wholeChange(entity, 'added', right && plan.addedDetail ? plan.addedDetail(right) : '')];
    const rawLeft = ownEntry(rawBefore, key);
    const rawRight = ownEntry(rawAfter, key);
    if (isSameValue(rawLeft, rawRight)) return [];
    const known = left && right ? plan.fields(entity, left, right) : [];
    const unknown = unknownFieldChanges(entity, ENTRY_FIELDS[plan.section], rawLeft, rawRight);
    if (known.length + unknown.length > 0) return [...known, ...unknown];
    return [{ area: plan.area, entityKey: key, entityLabel: entity.label, kind: 'changed', field: 'other', sentence: `${entity.label} — other settings changed` }];
  });
}

function unknownFieldChanges(entity: Entity, knownFields: readonly string[], before: unknown, after: unknown): CatalogChange[] {
  const left = isRecord(before) ? before : {};
  const right = isRecord(after) ? after : {};
  const fields = [...new Set([...Object.keys(right), ...Object.keys(left)])].filter(field => !knownFields.includes(field));
  return fields
    .filter(field => !isSameValue(ownEntry(left, field), ownEntry(right, field)))
    .map(field => ({ area: entity.area, entityKey: entity.key, entityLabel: entity.label, kind: 'changed' as const, field, sentence: `${entity.label} — ${field} changed` }));
}

function namesOf(document: CatalogDocument | null): Names {
  const models = new Map((document ? readModels(document) : []).map(model => [model.key, modelName(model)]));
  const aliases = new Map((document ? readAliases(document) : []).map(alias => [alias.key, aliasName(alias)]));
  return { model: key => models.get(key) ?? key, alias: key => aliases.get(key) ?? key };
}

function limitsPhrase(budget: BudgetEntry): string {
  const cost = budget.maxListCostUsd === undefined ? 'no cost limit' : `a cost limit of ${formatUsd(budget.maxListCostUsd)}`;
  const calls = budget.maxCalls === undefined ? 'no call limit' : `a call limit of ${formatNumber(budget.maxCalls)}`;
  return ` with ${cost} and ${calls}`;
}

function budgetFieldChanges(entity: Entity, before: BudgetEntry, after: BudgetEntry): CatalogChange[] {
  const calls = (budget: BudgetEntry): string => (budget.maxCalls === undefined ? NO_LIMIT : formatNumber(budget.maxCalls));
  return [
    ...compare(entity, 'app', 'app', appName(before.app), appName(after.app)),
    ...compare(entity, 'per', 'applies to', scopeName(before.per), scopeName(after.per)),
    ...compare(entity, 'window', 'window', windowName(before.window), windowName(after.window)),
    ...compare(entity, 'maxListCostUsd', 'cost limit', usdOr(before.maxListCostUsd, NO_LIMIT), usdOr(after.maxListCostUsd, NO_LIMIT)),
    ...compare(entity, 'maxCalls', 'call limit', calls(before), calls(after)),
  ];
}

const sameTarget = (left: BudgetEntry, right: BudgetEntry): boolean => left.app === right.app && left.per === right.per && left.window === right.window;

const sameBudget = (left: BudgetEntry, right: BudgetEntry): boolean => sameTarget(left, right) && left.maxCalls === right.maxCalls && left.maxListCostUsd === right.maxListCostUsd;

/**
 * Budgets have no key, so they are paired as untouched first, then by what they limit in order among duplicates, then by position within
 * one app, so editing a window reads as a change rather than a swap. Budgets of different apps are never paired.
 */
function diffBudgets(before: CatalogDocument | null, after: CatalogDocument): CatalogChange[] {
  const left = before ? readBudgets(before) : [];
  const right = readBudgets(after);
  const unmatched = new Set(left);
  const pairs = new Map<BudgetEntry, BudgetEntry>();
  const pairWith = (budget: BudgetEntry, matches: (candidate: BudgetEntry) => boolean): void => {
    if (pairs.has(budget)) return;
    const match = left.find(candidate => unmatched.has(candidate) && matches(candidate));
    if (!match) return;
    pairs.set(budget, match);
    unmatched.delete(match);
  };
  for (const budget of right) pairWith(budget, candidate => sameBudget(candidate, budget));
  for (const budget of right) pairWith(budget, candidate => sameTarget(candidate, budget));
  for (const budget of right) pairWith(budget, candidate => candidate.index === budget.index && candidate.app === budget.app);

  const changes = right.flatMap((budget): CatalogChange[] => {
    const entity: Entity = { area: 'budget', key: budgetKeyOf(right, budget), label: budgetLabel(budget) };
    const previous = pairs.get(budget);
    if (!previous) return [wholeChange(entity, 'added', limitsPhrase(budget))];
    return budgetFieldChanges({ ...entity, label: budgetLabel(previous) }, previous, budget);
  });
  for (const budget of unmatched) changes.push(wholeChange({ area: 'budget', key: budgetKeyOf(left, budget), label: budgetLabel(budget) }, 'removed'));
  return changes;
}

function webSearchFieldChanges(entity: Entity, before: WebSearchSpec, after: WebSearchSpec): CatalogChange[] {
  const count = (value: number | undefined): string => (value === undefined ? NOT_SET : formatNumber(value));
  return [
    ...compare(entity, 'kind', 'search engine', named(SEARCH_ENGINE_NAMES, before.kind), named(SEARCH_ENGINE_NAMES, after.kind)),
    ...compare(entity, 'url', 'address', before.url || NOT_SET, after.url || NOT_SET),
    ...credentialChange(entity, before.credential, after.credential),
    ...compare(entity, 'maxSearches', 'searches per answer', count(before.maxSearches), count(after.maxSearches)),
    ...compare(entity, 'results', 'results per search', count(before.results), count(after.results)),
    ...comparePrice(entity, 'pricePerSearchUsd', 'price per search', before.pricePerSearchUsd, after.pricePerSearchUsd, ''),
  ];
}

function diffWebSearch(before: CatalogDocument | null, after: CatalogDocument): CatalogChange[] {
  const entity: Entity = { area: 'tool', key: WEB_SEARCH_KEY, label: 'Web search' };
  const left = before ? readWebSearch(before) : undefined;
  const right = readWebSearch(after);
  const rawLeft = before ? rawWebSearch(before) : undefined;
  const rawRight = rawWebSearch(after);
  if (rawRight === undefined) return [wholeChange(entity, 'removed')];
  if (rawLeft === undefined) return [wholeChange(entity, 'added', right ? `, using ${named(SEARCH_ENGINE_NAMES, right.kind)}` : '')];
  const changes = [...(left && right ? webSearchFieldChanges(entity, left, right) : []), ...unknownFieldChanges(entity, WEB_SEARCH_FIELDS, rawLeft, rawRight)];
  if (changes.length > 0) return changes;
  return [{ area: 'tool', entityKey: entity.key, entityLabel: entity.label, kind: 'changed', field: 'other', sentence: `${entity.label} — other settings changed` }];
}

/** Each tool is one entity; web search is the only one synapse-server knows, so any other reads as a bare change. */
function diffTools(before: CatalogDocument | null, after: CatalogDocument): CatalogChange[] {
  const left = isRecord(before?.tools) ? before.tools : {};
  const right = isRecord(after.tools) ? after.tools : {};
  const keys = [...new Set([...Object.keys(right), ...Object.keys(left)])].filter(key => !isSameValue(ownEntry(left, key), ownEntry(right, key)));
  return keys.flatMap((key): CatalogChange[] =>
    key === WEB_SEARCH_KEY
      ? diffWebSearch(before, after)
      : [{ area: 'tool', entityKey: key, entityLabel: 'Tools', kind: 'changed', field: key, sentence: `Tools — ${key} changed` }],
  );
}

function diffOther(before: CatalogDocument | null, after: CatalogDocument): CatalogChange[] {
  const keys = [...new Set([...Object.keys(after), ...Object.keys(before ?? {})])].filter(key => !SECTIONS.includes(key));
  return keys
    .filter(key => !isSameValue(before ? ownEntry(before, key) : undefined, ownEntry(after, key)))
    .map(key => ({ area: 'other' as const, entityKey: key, entityLabel: 'Catalog', kind: 'changed' as const, field: key, sentence: `Catalog — ${key} changed` }));
}

export function describeChanges(before: CatalogDocument | null, after: CatalogDocument): CatalogChange[] {
  const names = { before: namesOf(before), after: namesOf(after) };
  const fallbackTitle = (key: string): string => {
    const parts = splitTaskKey(key);
    return parts ? taskTitle(parts) : key;
  };
  const changes = [
    ...diffBudgets(before, after),
    ...diffSection<TaskEntry>(before, after, {
      section: 'tasks',
      area: 'task',
      read: readTasks,
      label: (key, task) => (task ? taskTitle(task) : fallbackTitle(key)),
      fields: (entity, left, right) => taskFieldChanges(entity, left, right, names),
    }),
    ...diffSection<AliasEntry>(before, after, {
      section: 'aliases',
      area: 'alias',
      read: readAliases,
      label: (key, alias) => `Model name ${alias ? aliasName(alias) : key}`,
      fields: (entity, left, right) => aliasFieldChanges(entity, left, right, names),
      addedDetail: alias => `, pointing to ${names.after.model(alias.model)}`,
    }),
    ...diffSection<ModelEntry>(before, after, {
      section: 'models',
      area: 'model',
      read: readModels,
      label: (key, model) => `Model ${model ? modelName(model) : key}`,
      fields: modelFieldChanges,
    }),
    ...diffSection<ProviderEntry>(before, after, {
      section: 'providers',
      area: 'provider',
      read: readProviders,
      label: key => `Provider ${providerName(key)}`,
      fields: providerFieldChanges,
    }),
    ...diffTools(before, after),
    ...diffOther(before, after),
  ];
  if (changes.length > 0 || isSameValue(before, after)) return changes;
  return [{ area: 'other', entityKey: 'document', entityLabel: 'Catalog', kind: 'changed', sentence: 'Catalog — other changes; open the advanced editor to see them' }];
}
