import { type CatalogDocument, type DocumentEdit } from './catalog-document';
import { type AliasSpec, type DataPolicy, type ModelSpec, type ProviderSpec, type TaskEffort, type TaskRoute } from './catalog-spec.types';
import { isRecord, ownEntry } from './catalog-values';

type Entry = Record<string, unknown>;

type Section = 'tasks' | 'aliases' | 'models' | 'providers';

const NOUNS: Record<Section, string> = { tasks: 'feature', aliases: 'model name', models: 'model', providers: 'provider' };

export interface TaskMeta {
  /** Left out to keep the current value; blank removes it */
  label?: string;
  description?: string;
}

function editEntry(document: CatalogDocument, section: Section, key: string, edit: (entry: Entry) => Entry | string): DocumentEdit {
  const entries = document[section];
  const noun = NOUNS[section];
  if (!isRecord(entries) || !Object.hasOwn(entries, key)) return { ok: false, reason: `The draft has no ${noun} "${key}"` };
  const entry = ownEntry(entries, key);
  if (!isRecord(entry)) return { ok: false, reason: `The draft's ${noun} "${key}" is not an object` };
  const next = edit(entry);
  if (typeof next === 'string') return { ok: false, reason: next };
  return { ok: true, document: { ...document, [section]: { ...entries, [key]: next } } };
}

function upsertEntry(document: CatalogDocument, section: Section, key: string, entry: Entry): DocumentEdit {
  const entries = document[section] ?? {};
  if (!isRecord(entries)) return { ok: false, reason: `The draft's ${section} section is not an object` };
  return { ok: true, document: { ...document, [section]: { ...entries, [key]: entry } } };
}

function withField(entry: Entry, field: string, value: unknown): Entry {
  if (value !== undefined) return { ...entry, [field]: value };
  const { [field]: _removed, ...rest } = entry;
  return rest;
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function routeValue(route: TaskRoute): Entry {
  const when = route.when && Object.keys(route.when).length > 0 ? route.when : undefined;
  return when ? { when: { ...when }, model: route.model } : { model: route.model };
}

const PINNED_ROUTES = 'A pinned feature keeps its models: stored embeddings depend on them';

/** The server refuses any change to a pinned task's routes, since stored vectors depend on their models, so this refuses it first. */
export function withTaskRoutes(document: CatalogDocument, taskKey: string, routes: readonly TaskRoute[]): DocumentEdit {
  return editEntry(document, 'tasks', taskKey, task => (task.pinned === true ? PINNED_ROUTES : withField(task, 'routes', routes.map(routeValue))));
}

export type RawTaskField = 'routes' | 'effort';

/** Writes the value as given, so fields inside routes or effort that this console does not model survive a save; `undefined` removes the field. */
export function withTaskFieldValue(document: CatalogDocument, taskKey: string, field: RawTaskField, value: unknown): DocumentEdit {
  return editEntry(document, 'tasks', taskKey, task => (field === 'routes' && task.pinned === true ? PINNED_ROUTES : withField(task, field, value)));
}

export function withTaskEffort(document: CatalogDocument, taskKey: string, effort: TaskEffort | null): DocumentEdit {
  const value = effort ? { default: effort.default, ...(effort.min && { min: effort.min }), ...(effort.max && { max: effort.max }) } : undefined;
  return editEntry(document, 'tasks', taskKey, task => withField(task, 'effort', value));
}

export function withTaskMeta(document: CatalogDocument, taskKey: string, meta: TaskMeta): DocumentEdit {
  return editEntry(document, 'tasks', taskKey, task => {
    const labelled = meta.label === undefined ? task : withField(task, 'label', nonBlank(meta.label));
    return meta.description === undefined ? labelled : withField(labelled, 'description', nonBlank(meta.description));
  });
}

export function withTaskAliases(document: CatalogDocument, taskKey: string, aliases: readonly string[]): DocumentEdit {
  return editEntry(document, 'tasks', taskKey, task => withField(task, 'aliases', aliases.length === 0 ? undefined : [...aliases]));
}

export function withTaskDataPolicy(document: CatalogDocument, taskKey: string, dataPolicy: DataPolicy): DocumentEdit {
  return editEntry(document, 'tasks', taskKey, task => withField(task, 'dataPolicy', dataPolicy));
}

export function withAliasModel(document: CatalogDocument, aliasKey: string, model: string): DocumentEdit {
  return editEntry(document, 'aliases', aliasKey, alias => (alias.model === model ? `The draft already targets ${model}` : withField(alias, 'model', model)));
}

export function withAlias(document: CatalogDocument, aliasKey: string, alias: AliasSpec): DocumentEdit {
  const description = nonBlank(alias.description);
  const available = alias.available && Object.keys(alias.available).length > 0 ? alias.available : undefined;
  return upsertEntry(document, 'aliases', aliasKey, {
    label: alias.label.trim(),
    ...(description && { description }),
    model: alias.model,
    ...(alias.showVersion && { showVersion: true }),
    state: alias.state,
    ...(available && { available }),
  });
}

export function withModel(document: CatalogDocument, modelKey: string, model: ModelSpec): DocumentEdit {
  const version = nonBlank(model.version);
  return upsertEntry(document, 'models', modelKey, {
    label: model.label.trim(),
    ...(version && { version }),
    capabilities: { ...model.capabilities },
    pricePerMTok: { ...model.pricePerMTok },
    deployments: model.deployments.map(deployment => ({ provider: deployment.provider, id: deployment.id })),
  });
}

export function withoutModel(document: CatalogDocument, modelKey: string): DocumentEdit {
  const models = document.models;
  if (!isRecord(models) || !Object.hasOwn(models, modelKey)) return { ok: false, reason: `The draft has no model "${modelKey}"` };
  const { [modelKey]: _removed, ...rest } = models;
  return { ok: true, document: { ...document, models: rest } };
}

/** A provider names either a credential or the deprecated `apiKeyConfig`, never both; a credential wins. */
export function withProvider(document: CatalogDocument, providerKey: string, provider: ProviderSpec): DocumentEdit {
  const credential = nonBlank(provider.credential);
  const apiKeyConfig = credential ? undefined : nonBlank(provider.apiKeyConfig);
  return upsertEntry(document, 'providers', providerKey, {
    ...(provider.kind && { kind: provider.kind }),
    ...(provider.flavor && { flavor: provider.flavor }),
    url: provider.url.trim(),
    ...(credential && { credential }),
    ...(apiKeyConfig && { apiKeyConfig }),
    ...(provider.locality && { locality: provider.locality }),
    ...(provider.cost && { cost: provider.cost }),
    ...(provider.features.length > 0 && { features: [...provider.features] }),
    ...(provider.maxInflightPerReplica !== undefined && { maxInflightPerReplica: provider.maxInflightPerReplica }),
  });
}

export function withProviderCredential(document: CatalogDocument, providerKey: string, credentialId: string): DocumentEdit {
  return editEntry(document, 'providers', providerKey, ({ apiKeyConfig: _dropped, ...provider }) => ({ ...provider, credential: credentialId }));
}

export function withoutProviderCredential(document: CatalogDocument, providerKey: string): DocumentEdit {
  return editEntry(document, 'providers', providerKey, ({ credential: _dropped, ...provider }) => provider);
}
