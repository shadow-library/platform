import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { readAliases, readTasks } from '@/features/catalog/catalog-readers';
import { type ModelCapabilities, type ModelEntry, type ModelPrice } from '@/features/catalog/catalog-spec.types';
import { isRecord } from '@/features/catalog/catalog-values';
import { type DraftEditOutcome } from '@/features/catalog/draft-edit';
import { formatNumber, formatPrice } from '@/features/shared/format';
import { aliasName, effortName, modelName, providerName, taskTitle } from '@/features/shared/naming';
import { type Notice } from '@/features/shared/notice.types';
import { type CatalogIssueResponse } from '@/lib/apis/api-types.gen';

export interface ModelUser {
  key: string;
  name: string;
}

export interface ModelUsage {
  features: ModelUser[];
  modelNames: ModelUser[];
}

export type UsageIndex = ReadonlyMap<string, ModelUsage>;

export type CapabilityFilter = 'tools' | 'vision' | 'imageOutput' | 'embedding' | 'reasoning';

export interface ModelFilter {
  query: string;
  capabilities: readonly CapabilityFilter[];
}

export interface ProviderLink {
  key: string;
  name: string;
  known: boolean;
}

export interface ComparisonRow {
  id: string;
  label: string;
  values: string[];
  /** Per model: whether its price is the lowest one shown, marked only when some other model pays more */
  cheapest: boolean[];
}

export type ModelAction = 'added' | 'updated' | 'removed';

export interface ModelNotice extends Notice {
  changesLink?: boolean;
  issues?: CatalogIssueResponse[];
}

export const CAPABILITY_FILTERS: readonly CapabilityFilter[] = ['tools', 'vision', 'imageOutput', 'embedding', 'reasoning'];

export const CAPABILITY_FILTER_NAMES: Readonly<Record<CapabilityFilter, string>> = {
  tools: 'Tools',
  vision: 'Vision',
  imageOutput: 'Image output',
  embedding: 'Embeddings',
  reasoning: 'Reasoning',
};

const REASONING_NAMES: Readonly<Record<ModelCapabilities['reasoning'], string>> = { none: 'None', optional: 'Optional', mandatory: 'Always on' };

const CONTEXT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });

const EMPTY_USAGE: ModelUsage = { features: [], modelNames: [] };

const byName = (left: ModelUser, right: ModelUser): number => left.name.localeCompare(right.name);

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

const yesNo = (value: boolean | undefined): string => (value ? 'Yes' : 'No');

/** Every alias counts whatever its state, because the server checks that each one's model exists. */
export function modelUsageIndex(document: CatalogDocument): UsageIndex {
  const index = new Map<string, { features: Map<string, string>; modelNames: Map<string, string> }>();
  const entryOf = (model: string): { features: Map<string, string>; modelNames: Map<string, string> } => {
    const entry = index.get(model) ?? { features: new Map<string, string>(), modelNames: new Map<string, string>() };
    index.set(model, entry);
    return entry;
  };
  for (const task of readTasks(document)) for (const route of task.routes) entryOf(route.model).features.set(task.key, taskTitle(task));
  for (const alias of readAliases(document)) entryOf(alias.model).modelNames.set(alias.key, aliasName(alias));
  const users = (names: Map<string, string>): ModelUser[] => [...names].map(([key, name]) => ({ key, name })).sort(byName);
  return new Map([...index].map(([model, entry]) => [model, { features: users(entry.features), modelNames: users(entry.modelNames) }]));
}

export function usageOf(index: UsageIndex, modelKey: string): ModelUsage {
  return index.get(modelKey) ?? EMPTY_USAGE;
}

export function isInUse(usage: ModelUsage): boolean {
  return usage.features.length > 0 || usage.modelNames.length > 0;
}

export function usageSummary(usage: ModelUsage): string {
  const parts = [
    ...(usage.features.length > 0 ? [plural(usage.features.length, 'feature')] : []),
    ...(usage.modelNames.length > 0 ? [plural(usage.modelNames.length, 'model name')] : []),
  ];
  return parts.length === 0 ? 'Not used' : parts.join(' · ');
}

export function usageSentence(usage: ModelUsage): string {
  const names = [...usage.features, ...usage.modelNames].map(user => user.name);
  return names.length === 0 ? 'Not used by any feature or model name' : `Used by ${names.join(', ')}`;
}

/** Labels often carry the version already ("Opus 5.5"), so it is appended only when it would add something. */
export function modelTitle(model: Pick<ModelEntry, 'key' | 'label' | 'version'>): string {
  const name = modelName(model);
  return model.version && !name.includes(model.version) ? `${name} ${model.version}` : name;
}

export function formatContext(tokens: number): string {
  return CONTEXT.format(tokens);
}

export function hasCapability(capabilities: ModelCapabilities, filter: CapabilityFilter): boolean {
  switch (filter) {
    case 'tools':
      return capabilities.tools;
    case 'vision':
      return capabilities.vision;
    case 'imageOutput':
      return capabilities.imageOutput === true;
    case 'embedding':
      return capabilities.embedding !== undefined;
    case 'reasoning':
      return capabilities.reasoning !== 'none';
  }
}

export function capabilityChips(capabilities: ModelCapabilities): string[] {
  return [
    ...(capabilities.tools ? ['Tools'] : []),
    ...(capabilities.vision ? ['Vision'] : []),
    ...(capabilities.imageOutput ? ['Image output'] : []),
    ...(capabilities.embedding ? [`Embeddings (${formatNumber(capabilities.embedding.dimensions)} dimensions)`] : []),
    ...(capabilities.reasoning === 'optional' ? ['Reasoning'] : []),
    ...(capabilities.reasoning === 'mandatory' ? ['Reasoning (always on)'] : []),
    ...(capabilities.context !== undefined ? [`${formatContext(capabilities.context)} context`] : []),
  ];
}

export function filterModels(models: readonly ModelEntry[], filter: ModelFilter): ModelEntry[] {
  const query = filter.query.trim().toLowerCase();
  return models.filter(model => {
    const text = [modelTitle(model), model.key].join(' ').toLowerCase();
    return (query === '' || text.includes(query)) && filter.capabilities.every(capability => hasCapability(model.capabilities, capability));
  });
}

export function sortModels(models: readonly ModelEntry[]): ModelEntry[] {
  return [...models].sort((left, right) => modelTitle(left).localeCompare(modelTitle(right)) || left.key.localeCompare(right.key));
}

export function servedBy(model: Pick<ModelEntry, 'deployments'>, providerKeys: ReadonlySet<string>): ProviderLink[] {
  return model.deployments.map(deployment => ({ key: deployment.provider, name: providerName(deployment.provider), known: providerKeys.has(deployment.provider) }));
}

export function servedBySentence(links: readonly ProviderLink[]): string {
  if (links.length === 0) return 'No provider';
  return links.map(link => (link.known ? link.name : `${link.name} (not in the catalog)`)).join(', then ');
}

/** Keys of every entry, the ones the readers skip as malformed included, so a new model can never overwrite one. */
export function modelKeysOf(document: CatalogDocument): string[] {
  return isRecord(document.models) ? Object.keys(document.models) : [];
}

export function unreadableModelCount(document: CatalogDocument, readable: readonly ModelEntry[]): number {
  return Math.max(0, modelKeysOf(document).length - readable.length);
}

/** The server bills cached tokens at the input price when a model sets no cached price, so that is what comparisons use. */
export function cachedInputPrice(price: ModelPrice): number {
  return price.cachedInput ?? price.input;
}

export function cachedInputLabel(price: ModelPrice): string {
  return price.cachedInput === undefined ? `Same as input (${formatPrice(price.input)})` : formatPrice(price.cachedInput);
}

export function keepVisible(selection: readonly string[], visible: readonly ModelEntry[]): string[] {
  return selection.filter(key => visible.some(model => model.key === key));
}

export function cheapest(prices: readonly (number | undefined)[]): boolean[] {
  const known = prices.filter((price): price is number => price !== undefined);
  const lowest = Math.min(...known);
  const someoneDearer = known.some(price => price > lowest);
  return prices.map(price => someoneDearer && price === lowest);
}

export function compareModels(models: readonly ModelEntry[], usage: UsageIndex, providerKeys: ReadonlySet<string>): ComparisonRow[] {
  const none = (): boolean[] => models.map(() => false);
  const price = (
    id: string,
    label: string,
    read: (model: ModelEntry) => number | undefined,
    describe = (_model: ModelEntry, value: number) => formatPrice(value),
  ): ComparisonRow => {
    const prices = models.map(read);
    const values = models.map((model, index) => {
      const value = prices[index];
      return value === undefined ? '—' : describe(model, value);
    });
    return { id, label, values, cheapest: cheapest(prices) };
  };
  const row = (id: string, label: string, read: (model: ModelEntry) => string): ComparisonRow => ({ id, label, values: models.map(read), cheapest: none() });
  return [
    price('input', 'Input, per million tokens', model => model.pricePerMTok.input),
    price(
      'cachedInput',
      'Cached input, per million tokens',
      model => cachedInputPrice(model.pricePerMTok),
      model => cachedInputLabel(model.pricePerMTok),
    ),
    price('output', 'Output, per million tokens', model => model.pricePerMTok.output),
    price('perImage', 'Per image', model => model.pricePerMTok.perImage),
    row('context', 'Context window', model => (model.capabilities.context === undefined ? '—' : `${formatNumber(model.capabilities.context)} tokens`)),
    row('tools', 'Tools', model => yesNo(model.capabilities.tools)),
    row('vision', 'Vision', model => yesNo(model.capabilities.vision)),
    row('imageOutput', 'Image output', model => yesNo(model.capabilities.imageOutput)),
    row('embedding', 'Embeddings', model => (model.capabilities.embedding ? `${formatNumber(model.capabilities.embedding.dimensions)} dimensions` : 'No')),
    row('structuredOutput', 'Structured output', model => (model.capabilities.structuredOutput === 'native' ? 'Native' : 'Through the prompt')),
    row('reasoning', 'Reasoning', model => REASONING_NAMES[model.capabilities.reasoning]),
    row('efforts', 'Supported efforts', model => (model.capabilities.efforts?.length ? model.capabilities.efforts.map(effortName).join(', ') : '—')),
    row('promptCache', 'Prompt caching', model => yesNo(model.capabilities.promptCache === 'anthropic')),
    row('sampling', 'Sampling controls', model => yesNo(model.capabilities.sampling)),
    row('servedBy', 'Served by', model => servedBySentence(servedBy(model, providerKeys))),
    row('usedBy', 'Used by', model => {
      const users = usageOf(usage, model.key);
      return isInUse(users) ? [...users.features, ...users.modelNames].map(user => user.name).join(', ') : 'Not used';
    }),
  ];
}

export function defaultModelNote(name: string, action: ModelAction): string {
  return `Model ${name} ${action}`;
}

export function draftOutcomeNotice(outcome: DraftEditOutcome, name: string, action: ModelAction): ModelNotice {
  const failed = action === 'removed' ? `${name} wasn't removed` : `${name} wasn't saved`;
  switch (outcome.kind) {
    case 'saved': {
      const title = `${name} ${action} in the draft`;
      if (outcome.issues.length === 0) return { intent: 'success', title, body: 'It goes live once the draft is published.', changesLink: true };
      return {
        intent: 'warning',
        title,
        body: `The draft now has ${plural(outcome.issues.length, 'problem')} to fix before it can be published.`,
        changesLink: true,
      };
    }
    case 'invalid':
      return { intent: 'danger', title: failed, body: "Synapse couldn't accept the draft with this change.", issues: outcome.issues };
    case 'unchanged':
      return { intent: 'info', title: 'Nothing to save', body: `The draft already has these settings for ${name}.` };
    case 'refused':
      return { intent: 'danger', title: failed, body: outcome.reason };
    case 'conflict':
      return { intent: 'warning', title: 'Someone else changed the draft', body: "Your change wasn't saved. The screen now shows their version; check it and try again." };
    case 'failed':
      return { intent: 'danger', title: failed, body: outcome.message };
  }
}
