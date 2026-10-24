import { isApiError } from '@shadow-library/web';

import { budgetKeyOf, budgetLabel, type CatalogChange, type ChangeArea } from '@/features/catalog/catalog-changes';
import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { issueOwner, type IssueOwner } from '@/features/catalog/catalog-issues';
import { readAliases, readBudgets, readModels, readTasks, splitTaskKey } from '@/features/catalog/catalog-readers';
import { isSameValue, ownEntry } from '@/features/catalog/catalog-values';
import { formatDateTime, formatRelativeTime } from '@/features/shared/format';
import { aliasName, modelName, providerName, taskTitle } from '@/features/shared/naming';
import { type CatalogIssueResponse } from '@/lib/apis/api-types.gen';

const ARROW = '→';
const CONFLICT = 409;
const FORBIDDEN = 403;
const NOT_FOUND = 404;

export const AREA_ORDER: readonly ChangeArea[] = ['budget', 'task', 'alias', 'model', 'provider', 'other'];

const AREA_TITLES: Readonly<Record<ChangeArea, string>> = {
  budget: 'Budgets',
  task: 'Features',
  alias: 'Model names',
  model: 'Models',
  provider: 'Providers',
  other: 'Other',
};

const AREA_NOUNS: Readonly<Record<Exclude<ChangeArea, 'other'>, readonly [string, string]>> = {
  budget: ['budget', 'budgets'],
  task: ['feature', 'features'],
  alias: ['model name', 'model names'],
  model: ['model', 'models'],
  provider: ['provider', 'providers'],
};

export const WHOLE_CATALOG_ID = 'review-whole-catalog';

export type ChangeLine = { kind: 'text'; text: string } | { kind: 'transition'; lead: string; before: string; after: string; suffix: string };

export type FixTarget =
  { screen: 'feature'; task: string } | { screen: 'alias'; alias: string } | { screen: 'budgets' } | { screen: 'models' } | { screen: 'providers' } | { screen: 'advanced' };

export interface EntityReview {
  id: string;
  area: ChangeArea;
  entityKey: string;
  label: string;
  lines: ChangeLine[];
  issues: CatalogIssueResponse[];
  fix: FixTarget;
}

export interface AreaReview {
  area: ChangeArea;
  title: string;
  entities: EntityReview[];
  changeCount: number;
}

export interface ChangesReview {
  areas: AreaReview[];
  catalogIssues: CatalogIssueResponse[];
  changeCount: number;
  issueCount: number;
}

export type ValidationState =
  { status: 'checking' } | { status: 'unavailable'; message: string } | { status: 'not_allowed' } | { status: 'checked'; issues: CatalogIssueResponse[] };

export interface ProblemLink {
  id: string;
  label: string;
  count: number;
}

export type Readiness =
  { kind: 'ready' } | { kind: 'blocked'; problems: number; links: ProblemLink[] } | { kind: 'checking' } | { kind: 'unavailable'; message: string } | { kind: 'unchecked' };

export type DiffState = 'loading' | 'failed' | 'stale' | 'current';

export type DiscardFailure = { kind: 'conflict' } | { kind: 'forbidden' } | { kind: 'absent' } | { kind: 'failed'; message: string };

export interface SectionAccess {
  setBudgets: boolean;
  writeProviders: boolean;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Splits a change's sentence so its old and new values can be shown apart; the entity label is dropped because the group heading carries it. */
export function changeLine(change: CatalogChange): ChangeLine {
  const prefix = `${change.entityLabel} — `;
  const detail = capitalise(change.sentence.startsWith(prefix) ? change.sentence.slice(prefix.length) : change.sentence);
  if (change.before === undefined || change.after === undefined) return { kind: 'text', text: detail };
  const marker = `: ${change.before} ${ARROW} ${change.after}`;
  const at = detail.indexOf(marker);
  if (at <= 0) return { kind: 'text', text: detail };
  return { kind: 'transition', lead: detail.slice(0, at), before: change.before, after: change.after, suffix: detail.slice(at + marker.length) };
}

export function fixTargetOf(area: ChangeArea, entityKey: string): FixTarget {
  switch (area) {
    case 'task':
      return { screen: 'feature', task: entityKey };
    case 'alias':
      return { screen: 'alias', alias: entityKey };
    case 'budget':
      return { screen: 'budgets' };
    case 'model':
      return { screen: 'models' };
    case 'provider':
      return { screen: 'providers' };
    case 'other':
      return { screen: 'advanced' };
  }
}

const BUDGET_POSITION = /^budgets\[(\d+)\]$/;

/** Mirrors the labels `describeChanges` gives, for an entity that has problems but no changes. */
function ownerLabel(owner: IssueOwner, document: CatalogDocument): string {
  const key = owner.entityKey;
  switch (owner.area) {
    case 'budget': {
      const budgets = readBudgets(document);
      const budget = budgets.find(entry => budgetKeyOf(budgets, entry) === key);
      if (budget) return budgetLabel(budget);
      const position = BUDGET_POSITION.exec(key);
      return position ? `Budget ${Number(position[1]) + 1}` : 'Budget';
    }
    case 'task': {
      const task = readTasks(document).find(entry => entry.key === key);
      const parts = task ?? splitTaskKey(key);
      return parts ? taskTitle(parts) : key;
    }
    case 'alias': {
      const alias = readAliases(document).find(entry => entry.key === key);
      return `Model name ${alias ? aliasName(alias) : key}`;
    }
    case 'model': {
      const model = readModels(document).find(entry => entry.key === key);
      return `Model ${model ? modelName(model) : key}`;
    }
    case 'provider':
      return `Provider ${providerName(key)}`;
  }
}

/** Top-level settings outside the known sections all read as "Catalog", so they share one group. */
const groupKeyOf = (change: CatalogChange): string => (change.area === 'other' ? 'catalog' : change.entityKey);

export function buildReview(changes: readonly CatalogChange[], issues: readonly CatalogIssueResponse[], draft: CatalogDocument): ChangesReview {
  const entities = new Map<string, EntityReview>();
  const entityOf = (area: ChangeArea, entityKey: string, label: () => string): EntityReview => {
    const mapKey = `${area}\u0000${entityKey}`;
    const existing = entities.get(mapKey);
    if (existing) return existing;
    const entity: EntityReview = { id: `review-${entities.size + 1}`, area, entityKey, label: label(), lines: [], issues: [], fix: fixTargetOf(area, entityKey) };
    entities.set(mapKey, entity);
    return entity;
  };

  for (const change of changes) entityOf(change.area, groupKeyOf(change), () => change.entityLabel).lines.push(changeLine(change));
  const catalogIssues: CatalogIssueResponse[] = [];
  for (const issue of issues) {
    const owner = issueOwner(issue.path, draft);
    if (owner) entityOf(owner.area, owner.entityKey, () => ownerLabel(owner, draft)).issues.push(issue);
    else catalogIssues.push(issue);
  }

  const all = [...entities.values()];
  const areas = AREA_ORDER.map(area => {
    const grouped = all.filter(entity => entity.area === area);
    return { area, title: AREA_TITLES[area], entities: grouped, changeCount: grouped.reduce((sum, entity) => sum + entity.lines.length, 0) };
  }).filter(area => area.entities.length > 0);
  return { areas, catalogIssues, changeCount: changes.length, issueCount: issues.length };
}

const NO_ISSUES: CatalogIssueResponse[] = [];

export function issuesOf(validation: ValidationState): CatalogIssueResponse[] {
  return validation.status === 'checked' ? validation.issues : NO_ISSUES;
}

export function readinessOf(validation: ValidationState, review: ChangesReview): Readiness {
  switch (validation.status) {
    case 'checking':
      return { kind: 'checking' };
    case 'unavailable':
      return { kind: 'unavailable', message: validation.message };
    case 'not_allowed':
      return { kind: 'unchecked' };
    case 'checked':
      break;
  }
  if (validation.issues.length === 0) return { kind: 'ready' };
  const links = review.areas.flatMap(area =>
    area.entities.filter(entity => entity.issues.length > 0).map(entity => ({ id: entity.id, label: entity.label, count: entity.issues.length })),
  );
  if (review.catalogIssues.length > 0) links.push({ id: WHOLE_CATALOG_ID, label: 'Whole catalog', count: review.catalogIssues.length });
  return { kind: 'blocked', problems: validation.issues.length, links };
}

export function blockedTitle(problems: number): string {
  return `${plural(problems, 'problem')} must be fixed before publishing`;
}

/** Why publishing is unavailable right now, or `null` when it may go ahead; the server still validates the draft it publishes. */
export function publishBlocker(readiness: Readiness, diff: DiffState): string | null {
  if (readiness.kind === 'blocked') return 'Fix the problems listed above first: publishing is refused while any remain.';
  if (readiness.kind === 'checking') return 'Checking the draft for problems…';
  if (diff === 'loading') return 'Comparing the draft with the active catalog…';
  if (diff === 'failed') return "The comparison with the active catalog couldn't be loaded. Reload the page to try again.";
  if (diff === 'stale') return 'The draft changed while you were reviewing it. Reload to review the current draft before publishing it.';
  return null;
}

const SECTION_DEFAULTS = { budgets: [], providers: {} } as const;

function sectionOf(document: CatalogDocument | null, name: keyof typeof SECTION_DEFAULTS): unknown {
  const value = document ? ownEntry(document, name) : undefined;
  return value === undefined ? SECTION_DEFAULTS[name] : value;
}

/** Mirrors the server's `changedSections`: a discard reverting a section the caller may not edit is refused exactly as such a save is. */
export function discardBlocker(draft: CatalogDocument, active: CatalogDocument | null, access: SectionAccess): string | null {
  const reverts = (name: keyof typeof SECTION_DEFAULTS): boolean => !isSameValue(sectionOf(draft, name), sectionOf(active, name));
  const locked = [!access.setBudgets && reverts('budgets') ? 'budgets' : null, !access.writeProviders && reverts('providers') ? 'providers' : null].filter(
    section => section !== null,
  );
  if (locked.length === 0) return null;
  const sections = locked.join(' and ');
  return `This draft changes ${sections}, which your role can't edit, so you can't discard it. Ask someone who can edit ${sections}.`;
}

export function discardDescription(changeCount: number): string {
  const subject = changeCount === 1 ? 'The 1 unpublished change is' : `All ${changeCount} unpublished changes are`;
  return `${subject} thrown away for everyone, and the active catalog stays as it is. This can't be undone.`;
}

export function discardFailureOf(error: unknown): DiscardFailure {
  if (!isApiError(error)) return { kind: 'failed', message: error instanceof Error ? error.message : 'The draft could not be discarded' };
  if (error.status === CONFLICT) return { kind: 'conflict' };
  if (error.status === FORBIDDEN) return { kind: 'forbidden' };
  if (error.status === NOT_FOUND) return { kind: 'absent' };
  return { kind: 'failed', message: error.message };
}

export function changeCountLines(review: ChangesReview): string[] {
  return review.areas.flatMap(area => {
    if (area.changeCount === 0) return [];
    if (area.area === 'other') return [plural(area.changeCount, 'other catalog change')];
    const [singular, pluralForm] = AREA_NOUNS[area.area];
    const changed = area.entities.filter(entity => entity.lines.length > 0).length;
    return [`${plural(area.changeCount, 'change')} to ${plural(changed, singular, pluralForm)}`];
  });
}

const LIST = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

export function publishSummary(review: ChangesReview): string {
  return `This publishes ${LIST.format(changeCountLines(review))}.`;
}

export function changesBudgets(review: ChangesReview): boolean {
  return review.areas.some(area => area.area === 'budget' && area.changeCount > 0);
}

export interface DraftOrigin {
  createdAt: string;
  createdBy?: string;
}

/** Subjects are opaque ids, so only the viewer's own saves are named. */
export function draftOriginText(draft: DraftOrigin, viewer: string | undefined, now: number | null): string {
  const started = now === null ? formatDateTime(draft.createdAt) : formatRelativeTime(draft.createdAt, new Date(now));
  const savedBy = viewer !== undefined && draft.createdBy === viewer ? ' · last saved by you' : '';
  return `Draft started ${started}${savedBy}`;
}
