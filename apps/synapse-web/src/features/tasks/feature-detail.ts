import { issueSentence } from '@/features/catalog/catalog-issues';
import { type AliasEntry, type DataPolicy, type ModelEntry, type ProviderEntry, type TaskEntry } from '@/features/catalog/catalog-spec.types';
import { type ChangeResult } from '@/features/changes/change-notices';
import { modelDisplayName, modelEligibility } from '@/features/shared/model-options';
import { aliasName } from '@/features/shared/naming';
import { type CatalogIssueResponse } from '@/lib/apis/api-types.gen';

import { SECTION_CHANGED } from './section-edits';

/** synapse-server's `TASK_LABEL_MAX` and `TASK_DESCRIPTION_MAX`. */
export const TASK_LABEL_MAX = 60;
export const TASK_DESCRIPTION_MAX = 280;

export interface AboutForm {
  label: string;
  description: string;
}

export interface AboutProblems {
  label?: string;
  description?: string;
}

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface IssueLine {
  sentence: string;
  path: string;
}

export type FeedbackIntent = 'info' | 'success' | 'warning' | 'danger';

export interface SaveFeedback {
  intent: FeedbackIntent;
  title: string;
  body?: string;
  issues: IssueLine[];
  /** Whether the editor stays open with the person's values, or closes so it reopens on the reloaded ones */
  keepEditing: boolean;
}

export function aboutProblems(form: AboutForm): AboutProblems {
  return {
    ...(form.label.trim().length > TASK_LABEL_MAX && { label: `Keep the name to ${TASK_LABEL_MAX} characters` }),
    ...(form.description.trim().length > TASK_DESCRIPTION_MAX && { description: `Keep the description to ${TASK_DESCRIPTION_MAX} characters` }),
  };
}

const reasonText = (reasons: readonly string[]): string => reasons.map(reason => reason.charAt(0).toLowerCase() + reason.slice(1)).join('; ');

/** A key the task names but the catalog lacks stays offered, so saving another change does not silently drop it. */
export function aliasOptions(aliases: readonly AliasEntry[], selected: readonly string[]): ChoiceOption[] {
  const known = new Set(aliases.map(alias => alias.key));
  const options = [...aliases]
    .sort((left, right) => aliasName(left).localeCompare(aliasName(right)))
    .map(alias => ({ value: alias.key, label: alias.state === 'retired' ? `${aliasName(alias)} (retired)` : aliasName(alias) }));
  const missing = selected.filter(key => !known.has(key)).map(key => ({ value: key, label: `${key} (not in the catalog)` }));
  return [...missing, ...options];
}

/** Mirrors the server rule that every offered, non-retired name must point at a model able to serve the feature. */
export function aliasHints(selected: readonly string[], aliases: readonly AliasEntry[], models: readonly ModelEntry[], task: Pick<TaskEntry, 'requires' | 'kind'>): string[] {
  const aliasByKey = new Map(aliases.map(alias => [alias.key, alias]));
  const modelByKey = new Map(models.map(model => [model.key, model]));
  return selected.flatMap(key => {
    const alias = aliasByKey.get(key);
    if (!alias) return [`${key} isn't in the catalog, so Synapse will refuse it`];
    if (alias.state === 'retired') return [];
    const model = modelByKey.get(alias.model);
    if (!model) return [`${aliasName(alias)} points to ${alias.model}, which isn't in the catalog`];
    const eligibility = modelEligibility(model, { requires: task.requires, kind: task.kind });
    return eligibility.eligible ? [] : [`${aliasName(alias)} points to ${modelDisplayName(model)}: ${reasonText(eligibility.reasons)}`];
  });
}

export function reachableModelKeys(task: Pick<TaskEntry, 'routes' | 'aliases'>, aliases: readonly AliasEntry[]): string[] {
  const aliasByKey = new Map(aliases.map(alias => [alias.key, alias]));
  const keys = new Set(task.routes.map(route => route.model));
  for (const key of task.aliases) {
    const alias = aliasByKey.get(key);
    if (alias && alias.state !== 'retired') keys.add(alias.model);
  }
  return [...keys];
}

export interface PolicyContext {
  aliases: readonly AliasEntry[];
  models: readonly ModelEntry[];
  providers: readonly ProviderEntry[];
}

export interface FeatureContext extends PolicyContext {
  /** Selector names and values already used in the catalog, from routes and model-name availability */
  vocabulary: Readonly<Record<string, string[]>>;
}

export function dataPolicyHints(task: Pick<TaskEntry, 'routes' | 'aliases'>, policy: DataPolicy, context: PolicyContext): string[] {
  if (policy !== 'in_cluster_only') return [];
  const modelByKey = new Map(context.models.map(model => [model.key, model]));
  return reachableModelKeys(task, context.aliases).flatMap(key => {
    const model = modelByKey.get(key);
    if (!model) return [];
    const eligibility = modelEligibility(model, { dataPolicy: policy, providers: context.providers });
    return eligibility.eligible ? [] : [`${modelDisplayName(model)}: ${reasonText(eligibility.reasons)}`];
  });
}

function issueLines(issues: readonly CatalogIssueResponse[]): IssueLine[] {
  return issues.map(issue => ({ sentence: issueSentence(issue), path: issue.path }));
}

const CLOSE = { keepEditing: false, issues: [] };
const STAY = { keepEditing: true, issues: [] };

/** `null` when there is nothing to say here: the change went live and the page-wide notice reports it, or the person went back to editing. */
export function saveFeedback(result: ChangeResult): SaveFeedback | null {
  switch (result.kind) {
    case 'applied':
    case 'cancelled':
      return null;
    case 'invalid':
      return { ...STAY, intent: 'danger', title: "The change wasn't applied", body: 'Synapse refused it:', issues: issueLines(result.issues) };
    case 'unchanged':
      return { ...CLOSE, intent: 'info', title: 'Nothing to change', body: 'The catalog already has these values.' };
    case 'refused':
      if (result.reason === SECTION_CHANGED) return { ...CLOSE, intent: 'warning', title: 'Nothing was changed', body: result.reason };
      return { ...STAY, intent: 'danger', title: "This change can't be made", body: result.reason };
    case 'conflict':
      return {
        ...CLOSE,
        intent: 'warning',
        title: 'Someone else changed the catalog at the same time',
        body: 'Nothing was changed and the page has reloaded with their changes. Check the values and edit again.',
      };
    case 'failed':
      return { ...STAY, intent: 'danger', title: "The change couldn't be applied", body: result.message };
  }
}
