import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { issueOwner, issueSentence } from '@/features/catalog/catalog-issues';
import { type AliasEntry, type DataPolicy, type ModelEntry, type ProviderEntry, type TaskEntry } from '@/features/catalog/catalog-spec.types';
import { type DraftEditOutcome } from '@/features/catalog/draft-edit';
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
  /** Whether to point at the review page, where the draft is published */
  review: boolean;
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

/** Mirrors the publish rule that every offered, non-retired name must point at a model able to serve the feature. */
export function aliasHints(selected: readonly string[], aliases: readonly AliasEntry[], models: readonly ModelEntry[], task: Pick<TaskEntry, 'requires' | 'kind'>): string[] {
  const aliasByKey = new Map(aliases.map(alias => [alias.key, alias]));
  const modelByKey = new Map(models.map(model => [model.key, model]));
  return selected.flatMap(key => {
    const alias = aliasByKey.get(key);
    if (!alias) return [`${key} isn't in the catalog, so publishing will refuse it`];
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

function belongsTo(issue: CatalogIssueResponse, taskKey: string, document: CatalogDocument): boolean {
  const owner = issueOwner(issue.path, document);
  return owner?.area === 'task' && owner.entityKey === taskKey;
}

const CLOSE = { review: false, keepEditing: false, issues: [] };
const STAY = { review: false, keepEditing: true, issues: [] };

export function saveFeedback(outcome: DraftEditOutcome, taskKey: string, document: CatalogDocument): SaveFeedback {
  switch (outcome.kind) {
    case 'saved': {
      const total = outcome.issues.length;
      const own = outcome.issues.filter(issue => belongsTo(issue, taskKey, document));
      const body =
        total === 0
          ? 'Nothing changes for apps until the draft is published.'
          : `The draft has ${total === 1 ? '1 issue' : `${total} issues`} to fix before it can be published${own.length > 0 ? `, ${own.length} of them in this feature` : ''}.`;
      return { intent: total === 0 ? 'success' : 'warning', title: 'Saved to the draft', body, issues: issueLines(own), review: true, keepEditing: false };
    }
    case 'invalid':
      return { ...STAY, intent: 'danger', title: "The draft wasn't saved", body: 'Synapse refused the change:', issues: issueLines(outcome.issues) };
    case 'unchanged':
      return { ...CLOSE, intent: 'info', title: 'Nothing to save', body: 'The draft already has these values.' };
    case 'refused':
      if (outcome.reason === SECTION_CHANGED) return { ...CLOSE, intent: 'warning', title: 'Nothing was saved', body: outcome.reason };
      return { ...STAY, intent: 'danger', title: "This change can't be made", body: outcome.reason };
    case 'conflict':
      return {
        ...CLOSE,
        intent: 'warning',
        title: 'Someone else changed the draft at the same time',
        body: 'Nothing was saved and the page has reloaded with their changes. Check the values and edit again.',
      };
    case 'failed':
      return { ...STAY, intent: 'danger', title: "The draft couldn't be saved", body: outcome.message };
  }
}
