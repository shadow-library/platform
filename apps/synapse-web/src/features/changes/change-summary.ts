import { budgetKeyOf, type CatalogChange, type ChangeArea } from '@/features/catalog/catalog-changes';
import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { readAliases, readBudgets, readModels, readTasks, splitTaskKey } from '@/features/catalog/catalog-readers';
import { type TaskEntry } from '@/features/catalog/catalog-spec.types';
import { appName } from '@/features/shared/naming';

const ARROW = '→';

const AREA_ORDER: readonly ChangeArea[] = ['budget', 'task', 'alias', 'model', 'provider', 'other'];

const AREA_TITLES: Readonly<Record<ChangeArea, string>> = {
  budget: 'Budgets',
  task: 'Features',
  alias: 'Model names',
  model: 'Models',
  provider: 'Providers',
  other: 'Other',
};

const AREA_LABEL_PREFIXES: Readonly<Partial<Record<ChangeArea, string>>> = { budget: 'Budget for ', alias: 'Model name ', model: 'Model ', provider: 'Provider ' };

const LIST = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

export type ChangeLine = { kind: 'text'; text: string } | { kind: 'transition'; lead: string; before: string; after: string; suffix: string };

export interface SummaryItem {
  key: string;
  label: string;
  lines: ChangeLine[];
}

export interface SummaryGroup {
  area: ChangeArea;
  title: string;
  items: SummaryItem[];
}

export interface SectionAccess {
  writeProviders: boolean;
  setBudgets: boolean;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Splits a change's sentence so its old and new values can be shown apart; the entity label is dropped because the item heading carries it. */
export function changeLine(change: CatalogChange): ChangeLine {
  const prefix = `${change.entityLabel} — `;
  const detail = capitalise(change.sentence.startsWith(prefix) ? change.sentence.slice(prefix.length) : change.sentence);
  if (change.before === undefined || change.after === undefined) return { kind: 'text', text: detail };
  const marker = `: ${change.before} ${ARROW} ${change.after}`;
  const at = detail.indexOf(marker);
  if (at <= 0) return { kind: 'text', text: detail };
  return { kind: 'transition', lead: detail.slice(0, at), before: change.before, after: change.after, suffix: detail.slice(at + marker.length) };
}

/** The group heading already says what kind of item it is, so "Models: Model Sonnet 5.5" drops the repeat. */
function itemLabel(area: ChangeArea, label: string): string {
  const prefix = AREA_LABEL_PREFIXES[area];
  return prefix && label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

/** Top-level settings outside the known sections all read as "Catalog", so they share one item. */
const itemKeyOf = (change: CatalogChange): string => (change.area === 'other' ? 'catalog' : change.entityKey);

export function summarizeChanges(changes: readonly CatalogChange[]): SummaryGroup[] {
  return AREA_ORDER.map(area => {
    const items = new Map<string, SummaryItem>();
    for (const change of changes.filter(candidate => candidate.area === area)) {
      const key = itemKeyOf(change);
      const item = items.get(key) ?? { key, label: itemLabel(area, change.entityLabel), lines: [] };
      item.lines.push(changeLine(change));
      items.set(key, item);
    }
    return { area, title: AREA_TITLES[area], items: [...items.values()] };
  }).filter(group => group.items.length > 0);
}

function appsOfTasks(tasks: readonly TaskEntry[], uses: (task: TaskEntry) => boolean): string[] {
  return tasks.filter(uses).map(task => task.app);
}

function appsOfChange(change: CatalogChange, document: CatalogDocument): string[] {
  const tasks = readTasks(document);
  const liveAliases = readAliases(document).filter(alias => alias.state !== 'retired');
  const usesModel = (model: string) => (task: TaskEntry) =>
    task.routes.some(route => route.model === model) || liveAliases.some(alias => alias.model === model && task.aliases.includes(alias.key));
  switch (change.area) {
    case 'task':
      return [splitTaskKey(change.entityKey)?.app ?? ''];
    case 'budget': {
      const budgets = readBudgets(document);
      return budgets.filter(budget => budgetKeyOf(budgets, budget) === change.entityKey).map(budget => budget.app);
    }
    case 'alias':
      return appsOfTasks(tasks, task => task.aliases.includes(change.entityKey));
    case 'model':
      return appsOfTasks(tasks, usesModel(change.entityKey));
    case 'provider': {
      const models = readModels(document).filter(model => model.deployments.some(deployment => deployment.provider === change.entityKey));
      return models.flatMap(model => appsOfTasks(tasks, usesModel(model.key)));
    }
    case 'other':
      return tasks.map(task => task.app);
  }
}

/** Read from both sides, so moving a model name off a model still names the apps that were using it. */
export function affectedApps(before: CatalogDocument | null, after: CatalogDocument, changes: readonly CatalogChange[]): string[] {
  const documents = before ? [before, after] : [after];
  const apps = new Set(changes.flatMap(change => documents.flatMap(document => appsOfChange(change, document))).filter(app => app !== ''));
  return [...apps].sort((left, right) => appName(left).localeCompare(appName(right)));
}

export function effectSentence(apps: readonly string[]): string {
  if (apps.length === 0) return 'It takes effect immediately. No app uses what it changes yet.';
  return `It takes effect immediately for ${LIST.format(apps.map(appName))}.`;
}

/** Mirrors the server's section permissions, so a change it would refuse is explained before anyone presses Apply. */
export function lockedSectionsSentence(changes: readonly CatalogChange[], access: SectionAccess): string | null {
  const touches = (area: ChangeArea): boolean => changes.some(change => change.area === area);
  const locked = [!access.writeProviders && touches('provider') ? 'providers' : null, !access.setBudgets && touches('budget') ? 'budgets' : null].filter(
    section => section !== null,
  );
  if (locked.length === 0) return null;
  return `This changes ${locked.join(' and ')}, which your role can't change. Ask a Synapse administrator if you need it.`;
}
