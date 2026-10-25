import { type CatalogDocument, type DocumentEdit } from '@/features/catalog/catalog-document';
import { withAlias } from '@/features/catalog/catalog-edits';
import { CATALOG_KEY_HINT, CATALOG_KEY_PATTERN } from '@/features/catalog/catalog-keys';
import { readAliases, selectorValues } from '@/features/catalog/catalog-readers';
import { type AliasEntry, type AliasSpec, type AliasState } from '@/features/catalog/catalog-spec.types';
import { isRecord, isSameValue, ownEntry } from '@/features/catalog/catalog-values';
import { type CatalogEdit } from '@/features/catalog/draft-edit';

export const CONCURRENT_ALIAS_CHANGE = 'Someone else changed this model name while you were editing. Reopen it to see their change.';

export type AliasEditorMode = { kind: 'add' } | { kind: 'edit'; key: string };

export interface AvailabilityRule {
  rowId: number;
  selector: string;
  values: string[];
}

export interface AliasForm {
  key: string;
  label: string;
  description: string;
  model: string;
  state: AliasState;
  showVersion: boolean;
  rules: AvailabilityRule[];
}

export type AliasField = 'label' | 'description' | 'model' | 'state' | 'showVersion' | 'available';

export type AliasFormField = 'key' | 'label' | 'model';

export interface RuleErrors {
  selector?: string;
  values?: string;
}

export interface AliasFormErrors {
  fields: Partial<Record<AliasFormField, string>>;
  rules: Record<number, RuleErrors>;
}

export type AliasFormResult = { ok: true; key: string; spec: AliasSpec; fields: AliasField[] } | { ok: false; errors: AliasFormErrors };

export interface AliasFormContext {
  mode: AliasEditorMode;
  /** Every key already taken, retired and unreadable ones included */
  takenKeys: readonly string[];
  /** The form as it opened; only the fields changed since are checked and written */
  initial: AliasForm;
}

const ALIAS_FIELDS: readonly AliasField[] = ['label', 'description', 'model', 'state', 'showVersion', 'available'];

type Entry = Record<string, unknown>;

export function emptyAliasForm(): AliasForm {
  return { key: '', label: '', description: '', model: '', state: 'active', showVersion: false, rules: [] };
}

export function aliasFormOf(alias: AliasEntry): AliasForm {
  return {
    key: alias.key,
    label: alias.label,
    description: alias.description ?? '',
    model: alias.model,
    state: alias.state,
    showVersion: alias.showVersion,
    rules: Object.entries(alias.available ?? {}).map(([selector, values], rowId) => ({ rowId, selector, values: [...values] })),
  };
}

export function addRule(rules: readonly AvailabilityRule[]): AvailabilityRule[] {
  const rowId = rules.reduce((highest, rule) => Math.max(highest, rule.rowId), -1) + 1;
  return [...rules, { rowId, selector: '', values: [] }];
}

export function updateRule(rules: readonly AvailabilityRule[], rowId: number, patch: Partial<Omit<AvailabilityRule, 'rowId'>>): AvailabilityRule[] {
  return rules.map(rule => (rule.rowId === rowId ? { ...rule, ...patch } : rule));
}

export function removeRule(rules: readonly AvailabilityRule[], rowId: number): AvailabilityRule[] {
  return rules.filter(rule => rule.rowId !== rowId);
}

export function valueSuggestions(vocabulary: Readonly<Record<string, string[]>>, selector: string, values: readonly string[]): string[] {
  return selectorValues(vocabulary, selector).filter(value => !values.includes(value));
}

function cleanValues(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(value => value !== ''))];
}

export function availableOfRules(rules: readonly AvailabilityRule[]): Record<string, string[]> {
  return Object.fromEntries(rules.map(rule => [rule.selector.trim(), cleanValues(rule.values)]));
}

/** What a field means, so a change of whitespace, value order or rule order is not mistaken for an edit. */
function projection(form: AliasForm, field: AliasField): unknown {
  switch (field) {
    case 'label':
      return form.label.trim();
    case 'description':
      return form.description.trim();
    case 'available':
      return form.rules.map(rule => ({ selector: rule.selector.trim(), values: cleanValues(rule.values) }));
    default:
      return form[field];
  }
}

export function editedAliasFields(initial: AliasForm, form: AliasForm): AliasField[] {
  return ALIAS_FIELDS.filter(field => !isSameValue(projection(initial, field), projection(form, field)));
}

function keyError(key: string, context: AliasFormContext): string | undefined {
  if (context.mode.kind === 'edit') return undefined;
  if (key === '') return 'Enter a key';
  if (!CATALOG_KEY_PATTERN.test(key)) return CATALOG_KEY_HINT;
  const folded = key.toLowerCase();
  return context.takenKeys.some(taken => taken.toLowerCase() === folded) ? 'Another model name already uses this key, retired ones included' : undefined;
}

function ruleErrors(rules: readonly AvailabilityRule[]): Record<number, RuleErrors> {
  const seen = new Set<string>();
  const errors: Record<number, RuleErrors> = {};
  for (const rule of rules) {
    const selector = rule.selector.trim();
    const selectorError =
      selector === ''
        ? 'Choose or type a condition'
        : !CATALOG_KEY_PATTERN.test(selector)
          ? 'Use only letters, digits and . _ - : / @'
          : seen.has(selector)
            ? 'Another rule already uses this condition; put all its values in one rule'
            : undefined;
    seen.add(selector);
    const valuesError = cleanValues(rule.values).length === 0 ? 'Add at least one value' : undefined;
    if (selectorError || valuesError) errors[rule.rowId] = { ...(selectorError && { selector: selectorError }), ...(valuesError && { values: valuesError }) };
  }
  return errors;
}

function specOf(form: AliasForm): AliasSpec {
  const description = form.description.trim();
  const available = availableOfRules(form.rules);
  return {
    label: form.label.trim(),
    ...(description !== '' && { description }),
    model: form.model,
    state: form.state,
    showVersion: form.showVersion,
    ...(Object.keys(available).length > 0 && { available }),
  };
}

/** An edit checks only what changed, so a stored oddity the editor left alone (an empty rule, a missing model) never blocks saving another field. */
export function validateAliasForm(form: AliasForm, context: AliasFormContext): AliasFormResult {
  const key = context.mode.kind === 'edit' ? context.mode.key : form.key.trim();
  const fields = context.mode.kind === 'add' ? [...ALIAS_FIELDS] : editedAliasFields(context.initial, form);
  const checks = (field: AliasField): boolean => fields.includes(field);
  const candidates: Partial<Record<AliasFormField, string | undefined>> = {
    key: keyError(key, context),
    label: checks('label') && form.label.trim() === '' ? 'Enter the name users see' : undefined,
    model: checks('model') && form.model === '' ? 'Choose the model it points to' : undefined,
  };
  const fieldErrors = Object.fromEntries(Object.entries(candidates).filter(([, message]) => message !== undefined)) as AliasFormErrors['fields'];
  const rules = checks('available') ? ruleErrors(form.rules) : {};
  if (Object.keys(fieldErrors).length > 0 || Object.keys(rules).length > 0) return { ok: false, errors: { fields: fieldErrors, rules } };
  return { ok: true, key, spec: specOf(form), fields };
}

function withField(entry: Entry, field: string, value: unknown): Entry {
  if (value !== undefined) return { ...entry, [field]: value };
  const { [field]: _removed, ...rest } = entry;
  return rest;
}

function patchAlias(raw: Entry, fields: readonly AliasField[], spec: AliasSpec): Entry {
  return fields.reduce((entry, field) => withField(entry, field, field === 'showVersion' ? spec.showVersion || undefined : spec[field]), raw);
}

function rawAliasOf(document: CatalogDocument, key: string): { aliases: Entry; raw: Entry } | string {
  const aliases = document.aliases;
  const raw = isRecord(aliases) ? ownEntry(aliases, key) : undefined;
  if (!isRecord(aliases) || !isRecord(raw)) return `The draft no longer has the model name "${key}"; someone may have changed it in the Advanced editor`;
  return { aliases, raw };
}

/** Re-applied on a conflict retry: untouched fields keep what is stored now, and an edited field someone else changed meanwhile is refused. */
export function updateAliasEdit(key: string, initial: AliasForm, fields: readonly AliasField[], spec: AliasSpec): CatalogEdit {
  return (document: CatalogDocument): DocumentEdit => {
    const stored = rawAliasOf(document, key);
    if (typeof stored === 'string') return { ok: false, reason: stored };
    if (fields.length === 0) return { ok: true, document };
    const fresh = readAliases({ aliases: Object.fromEntries([[key, stored.raw]]) })[0];
    const current = fresh ? aliasFormOf(fresh) : undefined;
    const opened = (form: AliasForm, field: AliasField): unknown => (field === 'available' ? availableOfRules(form.rules) : projection(form, field));
    if (!current || fields.some(field => !isSameValue(opened(current, field), opened(initial, field)))) return { ok: false, reason: CONCURRENT_ALIAS_CHANGE };
    return { ok: true, document: { ...document, aliases: { ...stored.aliases, [key]: patchAlias(stored.raw, fields, spec) } } };
  };
}

export function retargetAliasEdit(key: string, opened: string, model: string): CatalogEdit {
  return (document: CatalogDocument): DocumentEdit => {
    const stored = rawAliasOf(document, key);
    if (typeof stored === 'string') return { ok: false, reason: stored };
    if (stored.raw.model === model) return { ok: true, document };
    if (stored.raw.model !== opened) return { ok: false, reason: CONCURRENT_ALIAS_CHANGE };
    return { ok: true, document: { ...document, aliases: { ...stored.aliases, [key]: { ...stored.raw, model } } } };
  };
}

/** Checked again on the draft it is applied to, since a key can never be reused once it exists, even retired. */
export function addAliasEdit(key: string, spec: AliasSpec): CatalogEdit {
  return (document: CatalogDocument): DocumentEdit => {
    const folded = key.toLowerCase();
    const aliases = document.aliases;
    if (isRecord(aliases) && Object.keys(aliases).some(taken => taken.toLowerCase() === folded))
      return { ok: false, reason: `The draft already has a model name with the key "${key}"` };
    return withAlias(document, key, spec);
  };
}
