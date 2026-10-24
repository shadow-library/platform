import { type ModelEntry, type TaskRoute } from '@/features/catalog/catalog-spec.types';
import { isRecord } from '@/features/catalog/catalog-values';
import { modelDisplayName, modelPriceText } from '@/features/shared/model-options';
import { selectorName } from '@/features/shared/naming';

export interface ConditionDraft {
  id: number;
  key: string;
  value: string;
}

type RawRoute = Record<string, unknown>;

export interface RuleDraft {
  id: number;
  conditions: ConditionDraft[];
  model: string;
  /** The stored route and the conditions it was read as; `null` for a rule added in the editor */
  loaded: { route: RawRoute; conditions: [string, string][] } | null;
}

/** The default route is edited apart from the ordered rules so it can never be removed, but it is written back where it was stored. */
export interface RoutingDraft {
  rules: RuleDraft[];
  fallback: string;
  fallbackRoute: RawRoute | null;
  /** -1 when the document had no default route */
  fallbackIndex: number;
  nextId: number;
}

export interface RoutingIssue {
  /** Index into `rules`; `null` for the "everyone else" rule */
  rule: number | null;
  message: string;
}

export interface ConditionPart {
  selector: string;
  value: string;
}

/** synapse-server's `KEY_PATTERN` for selector names. */
const SELECTOR_KEY = /^[A-Za-z0-9][\w.:/@-]*$/;

const isDefault = (route: TaskRoute): boolean => Object.keys(route.when ?? {}).length === 0;

function storedConditions(route: RawRoute): [string, string][] {
  if (!isRecord(route.when)) return [];
  return Object.entries(route.when).filter((pair): pair is [string, string] => typeof pair[1] === 'string');
}

/**
 * Takes the stored route objects, not the reader's normalised ones, so a save writes back exactly what it did not change. A document with no
 * default route, or several, still loads: the extra ones become condition-less rules that validation then flags.
 */
export function routingFromRoutes(routes: readonly unknown[]): RoutingDraft {
  const stored = routes.filter(isRecord);
  const fallbackIndex = stored.findIndex(route => storedConditions(route).length === 0);
  let nextId = 0;
  const rules = stored.flatMap((route, index): RuleDraft[] => {
    if (index === fallbackIndex) return [];
    const conditions = storedConditions(route);
    const drafts = conditions.map(([key, value]) => ({ id: nextId++, key, value }));
    return [{ id: nextId++, conditions: drafts, model: typeof route.model === 'string' ? route.model : '', loaded: { route, conditions } }];
  });
  const fallbackRoute = stored[fallbackIndex] ?? null;
  const fallback = typeof fallbackRoute?.model === 'string' ? fallbackRoute.model : '';
  return { rules, fallback, fallbackRoute, fallbackIndex, nextId };
}

function sameConditions(rule: RuleDraft, conditions: readonly [string, string][]): boolean {
  return (
    rule.conditions.length === conditions.length &&
    rule.conditions.every((condition, index) => condition.key === conditions[index]?.[0] && condition.value === conditions[index]?.[1])
  );
}

function routeOf(rule: RuleDraft): RawRoute {
  if (rule.loaded && sameConditions(rule, rule.loaded.conditions)) return { ...rule.loaded.route, model: rule.model };
  const when = Object.fromEntries(rule.conditions.map(condition => [condition.key, condition.value]));
  return { ...rule.loaded?.route, when, model: rule.model };
}

/** The default goes back to its stored position, or last when it had none or the rules before it were removed. */
export function routesFromRouting(draft: RoutingDraft): RawRoute[] {
  const routes = draft.rules.map(routeOf);
  const fallback = { ...draft.fallbackRoute, model: draft.fallback };
  const at = draft.fallbackIndex < 0 ? routes.length : Math.min(draft.fallbackIndex, routes.length);
  return [...routes.slice(0, at), fallback, ...routes.slice(at)];
}

const replaceRule = (draft: RoutingDraft, index: number, update: (rule: RuleDraft) => RuleDraft): RoutingDraft => ({
  ...draft,
  rules: draft.rules.map((rule, position) => (position === index ? update(rule) : rule)),
});

export function addRule(draft: RoutingDraft): RoutingDraft {
  const rule = { id: draft.nextId, conditions: [{ id: draft.nextId + 1, key: '', value: '' }], model: '', loaded: null };
  return { ...draft, rules: [...draft.rules, rule], nextId: draft.nextId + 2 };
}

export function removeRule(draft: RoutingDraft, index: number): RoutingDraft {
  return { ...draft, rules: draft.rules.filter((_, position) => position !== index) };
}

export function moveRule(draft: RoutingDraft, index: number, offset: -1 | 1): RoutingDraft {
  const target = index + offset;
  const moving = draft.rules[index];
  const other = draft.rules[target];
  if (!moving || !other) return draft;
  const rules = [...draft.rules];
  rules[index] = other;
  rules[target] = moving;
  return { ...draft, rules };
}

export function setRuleModel(draft: RoutingDraft, index: number, model: string): RoutingDraft {
  return replaceRule(draft, index, rule => ({ ...rule, model }));
}

export function setFallback(draft: RoutingDraft, model: string): RoutingDraft {
  return { ...draft, fallback: model };
}

export function addCondition(draft: RoutingDraft, index: number): RoutingDraft {
  const next = replaceRule(draft, index, rule => ({ ...rule, conditions: [...rule.conditions, { id: draft.nextId, key: '', value: '' }] }));
  return { ...next, nextId: draft.nextId + 1 };
}

export function removeCondition(draft: RoutingDraft, index: number, conditionIndex: number): RoutingDraft {
  return replaceRule(draft, index, rule => ({ ...rule, conditions: rule.conditions.filter((_, position) => position !== conditionIndex) }));
}

export function setCondition(draft: RoutingDraft, index: number, conditionIndex: number, patch: Partial<Pick<ConditionDraft, 'key' | 'value'>>): RoutingDraft {
  return replaceRule(draft, index, rule => ({
    ...rule,
    conditions: rule.conditions.map((condition, position) => (position === conditionIndex ? { ...condition, ...patch } : condition)),
  }));
}

export function resolveSelectorKey(input: string, knownKeys: readonly string[]): string {
  const typed = input.trim();
  const folded = typed.toLowerCase();
  return knownKeys.find(key => key === typed) ?? knownKeys.find(key => key.toLowerCase() === folded || selectorName(key).toLowerCase() === folded) ?? typed;
}

function signature(rule: RuleDraft): string {
  const pairs = rule.conditions.map(condition => [condition.key, condition.value]).sort(([left = ''], [right = '']) => left.localeCompare(right));
  return JSON.stringify(pairs);
}

function ruleIssues(rule: RuleDraft, index: number): string[] {
  const issues: string[] = [];
  const position = index + 1;
  if (rule.conditions.length === 0) issues.push(`Rule ${position} needs at least one condition; only "everyone else" has none`);
  if (rule.conditions.some(condition => !condition.key.trim() || !condition.value.trim())) issues.push(`Rule ${position} has a condition without a name or a value`);
  const keys = rule.conditions.map(condition => condition.key).filter(key => key.trim().length > 0);
  const invalid = keys.filter(key => !SELECTOR_KEY.test(key));
  if (invalid.length > 0) issues.push(`Rule ${position}: "${invalid.join('", "')}" can't be a condition name; use letters, digits and _ . : / @ - without spaces`);
  const repeated = [...new Set(keys.filter((key, at) => keys.indexOf(key) !== at))];
  if (repeated.length > 0) issues.push(`Rule ${position} uses ${repeated.map(selectorName).join(', ')} more than once`);
  if (!rule.model) issues.push(`Choose a model for rule ${position}`);
  return issues;
}

/** Mirrors the server's one-default-route rule; identical conditions are refused here too, because the later rule could never be chosen. */
export function validateRouting(draft: RoutingDraft): RoutingIssue[] {
  const issues: RoutingIssue[] = draft.rules.flatMap((rule, index) => ruleIssues(rule, index).map(message => ({ rule: index, message })));
  const seen = new Map<string, number>();
  draft.rules.forEach((rule, index) => {
    if (rule.conditions.length === 0) return;
    const key = signature(rule);
    const earlier = seen.get(key);
    if (earlier === undefined) seen.set(key, index);
    else issues.push({ rule: index, message: `Rule ${index + 1} has the same conditions as rule ${earlier + 1}, so it would never be used` });
  });
  if (!draft.fallback) issues.push({ rule: null, message: 'Choose a model for everyone else' });
  return issues;
}

export function conditionParts(when: Readonly<Record<string, string>> | undefined): ConditionPart[] {
  return Object.entries(when ?? {}).map(([key, value]) => ({ selector: selectorName(key), value }));
}

export function conditionText(when: Readonly<Record<string, string>> | undefined): string {
  const parts = conditionParts(when);
  if (parts.length === 0) return 'Everyone else';
  return `When ${parts.map(part => `${part.selector} is ${part.value}`).join(' and ')}`;
}

export function routeModelText(modelKey: string, model: ModelEntry | undefined): string {
  if (!model) return `${modelKey} (not in the catalog)`;
  return `${modelDisplayName(model)} (${modelPriceText(model.pricePerMTok)})`;
}

export function ruleSentence(route: TaskRoute, models: ReadonlyMap<string, ModelEntry>): string {
  return `${conditionText(route.when)} → ${routeModelText(route.model, models.get(route.model))}`;
}

export function displayRoutes(routes: readonly TaskRoute[]): TaskRoute[] {
  return [...routes.filter(route => !isDefault(route)), ...routes.filter(isDefault)];
}
