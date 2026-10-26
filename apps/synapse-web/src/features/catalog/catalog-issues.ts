import { type CatalogIssueResponse } from '@/lib/apis/api-types.gen';

import { budgetKeyOf, type ChangeArea } from './catalog-changes';
import { type CatalogDocument } from './catalog-document';
import { readBudgets } from './catalog-readers';
import { ENTRY_FIELDS, type KeyedSection } from './catalog-spec.types';
import { isRecord, ownEntry } from './catalog-values';

export interface IssueOwner {
  area: Exclude<ChangeArea, 'other'>;
  entityKey: string;
}

const SECTION_AREAS: Record<KeyedSection, IssueOwner['area']> = { tasks: 'task', aliases: 'alias', models: 'model', providers: 'provider' };

const BUDGET_PATH = /^budgets\[(\d+)\]/;

const TOOL_PATH = /^tools\.([^.[]+)/;

/** Codes whose server message says what was wrong with the value, which the plain sentence alone would lose. */
const DETAILED_CODES: readonly string[] = ['invalid_type', 'invalid_value', 'invalid_key', 'unknown_field'];

const ISSUE_SENTENCES: Readonly<Record<string, string>> = {
  invalid_type: 'This setting has the wrong kind of value',
  invalid_value: "This value isn't allowed",
  invalid_key: "This name can't be used as a key",
  missing_field: 'A required setting is missing',
  unknown_field: "This setting isn't recognised",
  unknown_provider: "It names a provider the catalog doesn't have",
  unknown_model: "It names a model the catalog doesn't have",
  unknown_alias: "It names a model name the catalog doesn't have",
  unknown_app: 'No feature belongs to this app, so the budget would never apply',
  missing_capability: 'The chosen model lacks a capability this feature needs',
  kind_mismatch: "The chosen model can't serve this kind of feature",
  effort_unordered: 'Effort must go from the lowest, through the default, to the highest',
  data_policy_violation: 'The chosen model can run outside our cluster, which this feature does not allow',
  pinned_changed: "This feature's models are pinned: stored embeddings depend on them",
  task_removed: "Apps depend on this feature, so it can't be removed",
  alias_removed: 'Saved choices depend on this model name, so retire it instead of removing it',
  no_routes: 'The feature has no rule choosing its model',
  default_route_count: 'The feature needs exactly one default rule, for everyone else',
  no_deployments: "The model isn't served by any provider",
  budget_without_limit: 'The budget needs a cost limit, a call limit or both',
  unknown_credential: "The API key it names doesn't exist",
  credential_revoked: 'The API key it names has been revoked',
  credential_origin_mismatch: 'The API key it names is only allowed for a different address',
};

const startsEntry = (rest: string, key: string): boolean => rest === key || rest.startsWith(`${key}.`) || rest.startsWith(`${key}[`);

/** Keys may contain dots, so a field name found after a dot is the only other clue to where the key ends. */
function keyBeforeField(rest: string, fields: readonly string[]): string {
  for (let dot = rest.indexOf('.'); dot !== -1; dot = rest.indexOf('.', dot + 1)) {
    const tail = rest.slice(dot + 1);
    if (fields.some(field => startsEntry(tail, field))) return rest.slice(0, dot);
  }
  return rest;
}

/** Resolves against the document's own keys first, longest match winning, because `tasks.novel-forge.chat.routes[1]` cannot be split on dots. */
export function issueOwner(path: string, document: CatalogDocument): IssueOwner | null {
  const budget = BUDGET_PATH.exec(path);
  if (budget) {
    const index = Number(budget[1]);
    const budgets = readBudgets(document);
    const entry = budgets.find(candidate => candidate.index === index);
    return { area: 'budget', entityKey: entry ? budgetKeyOf(budgets, entry) : `budgets[${index}]` };
  }
  const tool = TOOL_PATH.exec(path)?.[1];
  if (tool) return { area: 'tool', entityKey: tool };
  const section = (Object.keys(SECTION_AREAS) as KeyedSection[]).find(candidate => path.startsWith(`${candidate}.`));
  if (!section) return null;
  const rest = path.slice(section.length + 1);
  const entries = document[section];
  const keys = isRecord(entries) ? Object.keys(entries).filter(key => startsEntry(rest, key)) : [];
  const entityKey = keys.reduce<string | undefined>((longest, key) => (!longest || key.length > longest.length ? key : longest), undefined);
  return { area: SECTION_AREAS[section], entityKey: entityKey ?? keyBeforeField(rest, ENTRY_FIELDS[section]) };
}

export function issueSentence(issue: CatalogIssueResponse): string {
  const sentence = ownEntry(ISSUE_SENTENCES, issue.code);
  if (!sentence) return issue.message;
  return DETAILED_CODES.includes(issue.code) && issue.message ? `${sentence}: ${issue.message}` : sentence;
}
