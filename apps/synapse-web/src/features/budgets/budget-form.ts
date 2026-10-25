import { type CatalogChange, describeChanges } from '@/features/catalog/catalog-changes';
import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { readBudgets } from '@/features/catalog/catalog-readers';
import { type BudgetEntry, type BudgetScope, type BudgetSpec, type BudgetWindow } from '@/features/catalog/catalog-spec.types';
import { isSameValue } from '@/features/catalog/catalog-values';
import { truncateNote } from '@/features/catalog/catalog-change';

export interface BudgetFormValues {
  app: string;
  per: BudgetScope;
  window: BudgetWindow;
  cost: string;
  calls: string;
}

export type BudgetFormField = 'app' | 'cost' | 'calls';

export type BudgetFormErrors = Partial<Record<BudgetFormField, string>>;

export type BudgetFormResult = { ok: true; budget: BudgetSpec } | { ok: false; errors: BudgetFormErrors };

export type BudgetChange = { kind: 'add'; budget: BudgetSpec } | { kind: 'edit'; index: number; budget: BudgetSpec } | { kind: 'remove'; index: number };

export const BUDGET_FORM_MESSAGES = {
  app: 'Choose the app this budget limits',
  cost: 'Enter an amount like 1,250.50',
  costZero: 'Enter an amount above zero, like 1,250.50',
  calls: 'Enter a whole number of calls, like 1,000',
  callsZero: 'Enter a number of calls above zero',
  noLimit: 'Set a cost limit, a call limit or both',
} as const;

const AMOUNT = /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
const COUNT = /^(\d{1,3}(,\d{3})+|\d+)$/;
const CURRENCY_PREFIX = /^\$\s*/;
const GROUPING = /,/g;

type Parsed = { kind: 'empty' } | { kind: 'valid'; value: number } | { kind: 'invalid' };

/** Only unambiguous US notation: on a spending limit, "1.250,50" is refused rather than read as $1.2505. */
function parseLimit(text: string, pattern: RegExp): Parsed {
  const trimmed = text.trim();
  const bare = pattern === AMOUNT ? trimmed.replace(CURRENCY_PREFIX, '') : trimmed;
  if (bare === '') return { kind: 'empty' };
  if (!pattern.test(bare)) return { kind: 'invalid' };
  const value = Number(bare.replace(GROUPING, ''));
  return Number.isFinite(value) && (pattern === AMOUNT || Number.isSafeInteger(value)) ? { kind: 'valid', value } : { kind: 'invalid' };
}

/** A zero limit refuses every call, so it is kept only when the budget already had it, never newly typed. */
function limitError(parsed: Parsed, original: number | undefined, messages: { format: string; zero: string }): string | undefined {
  if (parsed.kind === 'invalid') return messages.format;
  if (parsed.kind === 'valid' && parsed.value === 0 && original !== 0) return messages.zero;
  return undefined;
}

export function budgetFormOf(budget: BudgetSpec | undefined, apps: readonly string[]): BudgetFormValues {
  if (!budget) return { app: apps.length === 1 ? (apps[0] ?? '') : '', per: 'subject', window: '1d', cost: '', calls: '' };
  return {
    app: budget.app,
    per: budget.per,
    window: budget.window,
    cost: budget.maxListCostUsd === undefined ? '' : String(budget.maxListCostUsd),
    calls: budget.maxCalls === undefined ? '' : String(budget.maxCalls),
  };
}

/** Mirrors the server's `budget_without_limit` rule; the server still validates the whole catalog on every change. */
export function validateBudgetForm(values: BudgetFormValues, original?: BudgetSpec): BudgetFormResult {
  const cost = parseLimit(values.cost, AMOUNT);
  const calls = parseLimit(values.calls, COUNT);
  const costError = limitError(cost, original?.maxListCostUsd, { format: BUDGET_FORM_MESSAGES.cost, zero: BUDGET_FORM_MESSAGES.costZero });
  const callsError = limitError(calls, original?.maxCalls, { format: BUDGET_FORM_MESSAGES.calls, zero: BUDGET_FORM_MESSAGES.callsZero });
  const errors: BudgetFormErrors = {
    ...(!values.app && { app: BUDGET_FORM_MESSAGES.app }),
    ...(costError && { cost: costError }),
    ...(callsError && { calls: callsError }),
    ...(cost.kind === 'empty' && calls.kind === 'empty' && { cost: BUDGET_FORM_MESSAGES.noLimit }),
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    budget: {
      app: values.app,
      per: values.per,
      window: values.window,
      ...(calls.kind === 'valid' && { maxCalls: calls.value }),
      ...(cost.kind === 'valid' && { maxListCostUsd: cost.value }),
    },
  };
}

/** The apps the catalog has features for: a budget for any other app is refused as `unknown_app`. */
export function budgetApps(tasks: readonly { app: string }[], current?: string): string[] {
  const apps = new Set(tasks.map(task => task.app));
  if (current) apps.add(current);
  return [...apps].sort((left, right) => left.localeCompare(right));
}

export function budgetsOf(document: CatalogDocument): unknown[] {
  return Array.isArray(document.budgets) ? [...document.budgets] : [];
}

/** Applied to the raw array so every untouched entry is sent back exactly as the active catalog holds it. */
export function withBudgetChange(budgets: readonly unknown[], change: BudgetChange): unknown[] {
  if (change.kind === 'add') return [...budgets, change.budget];
  if (change.index < 0 || change.index >= budgets.length) return [...budgets];
  if (change.kind === 'remove') return budgets.filter((_, index) => index !== change.index);
  return budgets.map((budget, index) => (index === change.index ? change.budget : budget));
}

export function sameBudgets(left: readonly unknown[], right: readonly unknown[]): boolean {
  return isSameValue(left, right);
}

export interface BudgetBasis {
  version: number;
  document: CatalogDocument;
  rawBudgets: unknown[];
  entries: BudgetEntry[];
}

export interface BudgetPublishPlan {
  budgets: unknown[];
  expectedVersion: number;
  changes: CatalogChange[];
}

export function budgetBasisOf(version: number, document: CatalogDocument): BudgetBasis {
  return { version, document, rawBudgets: budgetsOf(document), entries: readBudgets(document) };
}

/** Planned on the version the edit started from, never a newer one, so a change made meanwhile is refused with 409 rather than edited over. */
export function planBudgetPublish(basis: BudgetBasis, change: BudgetChange): BudgetPublishPlan | null {
  const budgets = withBudgetChange(basis.rawBudgets, change);
  if (sameBudgets(basis.rawBudgets, budgets)) return null;
  return { budgets, expectedVersion: basis.version, changes: describeChanges(basis.document, { ...basis.document, budgets }) };
}

/** Admission collapses budgets of one app, scope and window into one counter under the tightest limits. */
export function sharesCounter(budgets: readonly BudgetEntry[], budget: Pick<BudgetSpec, 'app' | 'per' | 'window'>, exceptIndex?: number): boolean {
  return budgets.some(other => other.index !== exceptIndex && other.app === budget.app && other.per === budget.per && other.window === budget.window);
}

/** Puts back the budgets the change replaced, only while the version it made is still live. */
export function budgetUndoInput(basis: Pick<BudgetBasis, 'version' | 'rawBudgets'>, liveVersion: number): { budgets: unknown[]; expectedVersion: number; note: string } {
  return { budgets: basis.rawBudgets, expectedVersion: liveVersion, note: `Restored the budgets of version ${basis.version}` };
}

export function budgetNote(changes: readonly CatalogChange[], typed: string): string | undefined {
  const note = typed.trim() || changes.map(change => change.sentence).join('; ');
  if (!note) return undefined;
  return truncateNote(note);
}
