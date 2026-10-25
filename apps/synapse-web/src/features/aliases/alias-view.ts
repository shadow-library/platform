import { type BadgeIntent } from '@shadow-library/ui';

import { describeChanges } from '@/features/catalog/catalog-changes';
import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { readAliases, readModels, readProviders, readTasks, splitTaskKey } from '@/features/catalog/catalog-readers';
import { type AliasEntry, type AliasState, type ModelEntry, type TaskEntry, type TaskKind } from '@/features/catalog/catalog-spec.types';
import { isRecord, ownEntry, strings } from '@/features/catalog/catalog-values';
import { type DraftEditOutcome } from '@/features/catalog/draft-edit';
import { modelDisplayName, type ModelNeeds, modelPriceText } from '@/features/shared/model-options';
import { aliasName, appName, selectorName, taskName, taskTitle } from '@/features/shared/naming';
import { type DraftNotice, draftOutcomeNotice, draftProblemsSentence } from '@/features/shared/draft-notice';

export interface AliasStateInfo {
  label: string;
  intent: BadgeIntent;
  meaning: string;
}

export const ALIAS_STATE_INFO: Readonly<Record<AliasState, AliasStateInfo>> = {
  active: { label: 'Active', intent: 'success', meaning: 'Offered to users' },
  hidden: { label: 'Hidden', intent: 'warning', meaning: 'Usable but not offered' },
  retired: { label: 'Retired', intent: 'neutral', meaning: "No longer offered; requests fall back to the feature's rules" },
};

const STATE_ORDER: readonly AliasState[] = ['active', 'hidden', 'retired'];

export const RETIRED_AVAILABILITY = 'Not used — retired';

export interface AliasUser {
  key: string;
  title: string;
}

export interface AliasTarget {
  key: string;
  name?: string;
  price?: string;
  version?: string;
}

export interface AliasRow {
  key: string;
  name: string;
  description?: string;
  seen: string;
  showVersion: boolean;
  target: AliasTarget;
  state: AliasState;
  availability: string;
  usedBy: AliasUser[];
  changed: boolean;
  entry: AliasEntry;
}

export type AliasAction = 'added' | 'updated' | 'retargeted';

/** Mirrors synapse-server's `isAliasAvailable`: every rule must match, so one rule allowing no value makes the name available nowhere. */
export function availabilitySentence(available: Record<string, string[]> | undefined): string {
  const rules = Object.entries(available ?? {});
  if (rules.length === 0) return 'Everywhere';
  const empty = rules.find(([, values]) => values.length === 0);
  if (empty) return `Nowhere: no ${selectorName(empty[0])} value is allowed`;
  return `Only when ${rules.map(([selector, values]) => `${selectorName(selector)} is ${values.join(' or ')}`).join(' and ')}`;
}

/** Mirrors synapse-server's label rule for responses. */
export function seenLabel(alias: Pick<AliasEntry, 'label' | 'showVersion'>, model: Pick<ModelEntry, 'version'> | undefined): string {
  return alias.showVersion && model?.version ? `${alias.label} ${model.version}` : alias.label;
}

export function aliasUsers(tasks: readonly TaskEntry[], aliasKey: string): AliasUser[] {
  return tasks
    .filter(task => task.aliases.includes(aliasKey))
    .map(task => ({ key: task.key, title: taskTitle(task) }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

/** With no draft nothing is unpublished; with no active version every name in the draft is. */
export function changedAliasKeys(active: CatalogDocument | null, draft: CatalogDocument | null): Set<string> {
  if (!draft) return new Set();
  return new Set(
    describeChanges(active, draft)
      .filter(change => change.area === 'alias')
      .map(change => change.entityKey),
  );
}

function targetOf(models: ReadonlyMap<string, ModelEntry>, key: string): AliasTarget {
  const model = models.get(key);
  if (!model) return { key };
  return { key, name: modelDisplayName(model), price: modelPriceText(model.pricePerMTok), ...(model.version && { version: model.version }) };
}

export function aliasRows(document: CatalogDocument, changed: ReadonlySet<string>): AliasRow[] {
  const models = new Map(readModels(document).map(model => [model.key, model]));
  const tasks = readTasks(document);
  return readAliases(document)
    .map(alias => ({
      key: alias.key,
      name: aliasName(alias),
      ...(alias.description?.trim() && { description: alias.description.trim() }),
      seen: seenLabel(alias, models.get(alias.model)),
      showVersion: alias.showVersion,
      target: targetOf(models, alias.model),
      state: alias.state,
      availability: alias.state === 'retired' ? RETIRED_AVAILABILITY : availabilitySentence(alias.available),
      usedBy: aliasUsers(tasks, alias.key),
      changed: changed.has(alias.key),
      entry: alias,
    }))
    .sort((left, right) => STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state) || left.name.localeCompare(right.name));
}

export function aliasKeysOf(document: CatalogDocument | null): string[] {
  return document && isRecord(document.aliases) ? Object.keys(document.aliases) : [];
}

export function unreadableAliasCount(document: CatalogDocument): number {
  return aliasKeysOf(document).length - readAliases(document).length;
}

/** The server checks a non-retired name's model against every feature offering it; a kind is hinted only when they all share one. */
export function aliasModelNeeds(document: CatalogDocument, aliasKey: string, state?: AliasState): ModelNeeds {
  const stored = readAliases(document).find(alias => alias.key === aliasKey);
  if ((state ?? stored?.state) === 'retired') return {};
  const tasks = readTasks(document).filter(task => task.aliases.includes(aliasKey));
  if (tasks.length === 0) return {};
  const requires = [...new Set(tasks.flatMap(task => task.requires))];
  const kinds = new Set<TaskKind>(tasks.map(task => task.kind));
  const [kind] = kinds;
  const inCluster = tasks.some(task => task.dataPolicy === 'in_cluster_only');
  return {
    requires,
    ...(kinds.size === 1 && kind && { kind }),
    ...(inCluster && { dataPolicy: 'in_cluster_only' as const, providers: readProviders(document) }),
  };
}

export interface FeatureNames {
  app: string;
  feature: string;
}

/** The ledger records the full task key; a task the catalog no longer has is still named from its key. */
export function featureNames(app: string, taskKey: string, tasks: ReadonlyMap<string, TaskEntry>): FeatureNames {
  const task = tasks.get(taskKey);
  if (task) return { app: appName(task.app), feature: taskName(task) };
  const parts = splitTaskKey(taskKey);
  return { app: appName(parts?.app ?? app), feature: parts ? taskName(parts) : taskKey };
}

export function defaultAliasNote(name: string, action: AliasAction, model?: string): string {
  return action === 'retargeted' && model ? `Model name ${name} now uses ${model}` : `Model name ${name} ${action}`;
}

export function aliasOutcomeNotice(outcome: DraftEditOutcome, name: string, action: AliasAction): DraftNotice {
  if (outcome.kind !== 'saved') return draftOutcomeNotice(outcome, name, 'updated');
  const title = action === 'retargeted' ? `${name} now points to the new model in the draft` : `${name} ${action} in the draft`;
  if (outcome.issues.length === 0) return { intent: 'success', title, body: 'Nothing changes for users until the draft is published.', changesLink: true };
  return { intent: 'warning', title, body: draftProblemsSentence(outcome.issues.length), changesLink: true };
}

/**
 * Mirrors synapse-server's `isAliasAvailable` (every rule must match, each rule allows any of its values): the conditions under which a request
 * naming the alias used to resolve and would now be refused with `SYN_ALIAS_UNAVAILABLE`.
 */
export function narrowedConditions(before: Record<string, string[]> | undefined, after: Record<string, string[]> | undefined): string[] {
  const previous = before ?? {};
  if (Object.values(previous).some(values => values.length === 0)) return [];
  return Object.entries(after ?? {}).flatMap(([selector, values]): string[] => {
    const name = selectorName(selector);
    if (!Object.hasOwn(previous, selector)) return [`${name} is not ${values.join(' or ')} or isn't sent`];
    return strings(ownEntry(previous, selector))
      .filter(value => !values.includes(value))
      .map(value => `${name} is ${value}`);
  });
}

export function narrowingDescription(name: string, conditions: readonly string[]): string {
  return `Anyone who chose ${name} will get errors until they pick another model if ${conditions.join(', or if ')}.`;
}

export function retireDescription(name: string, usedBy: readonly AliasUser[]): string {
  const offered = usedBy.length === 0 ? '' : ` ${usedBy.map(user => user.title).join(', ')} will stop offering it.`;
  return (
    `People can no longer pick ${name}. Apps that stored it keep working: their requests use the feature's own rules instead.${offered} ` +
    'A model name can never be deleted or renamed, but you can make it active again later. Nothing changes until the draft is published.'
  );
}
