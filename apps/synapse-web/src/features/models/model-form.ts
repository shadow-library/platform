import { type CatalogDocument, type DocumentEdit } from '@/features/catalog/catalog-document';
import { withModel, withoutModel } from '@/features/catalog/catalog-edits';
import { CATALOG_KEY_HINT, CATALOG_KEY_PATTERN } from '@/features/catalog/catalog-keys';
import { type Effort, EFFORTS, type ModelCapabilities, type ModelEntry, type ModelSpec, type ReasoningMode } from '@/features/catalog/catalog-spec.types';
import { readModels } from '@/features/catalog/catalog-readers';
import { isRecord, isSameValue, ownEntry } from '@/features/catalog/catalog-values';
import { type CatalogEdit, compareAndSet } from '@/features/catalog/catalog-change';

import { isInUse, modelKeysOf, modelUsageIndex, usageOf, usageSentence } from './model-view';

export type EditorMode = { kind: 'add' } | { kind: 'edit'; key: string };

export interface DeploymentRow {
  /** Stable across reordering, so each row keeps its own inputs */
  rowId: number;
  provider: string;
  id: string;
}

export interface ModelForm {
  key: string;
  label: string;
  version: string;
  input: number | null;
  cachedInput: number | null;
  output: number | null;
  perImage: number | null;
  tools: boolean;
  structuredOutput: ModelCapabilities['structuredOutput'];
  vision: boolean;
  imageOutput: boolean;
  /** Set only for an embedding model */
  dimensions: number | null;
  context: number | null;
  reasoning: ReasoningMode;
  efforts: Effort[];
  promptCache: ModelCapabilities['promptCache'];
  sampling: boolean;
  deployments: DeploymentRow[];
}

export type ModelFormField = 'key' | 'label' | 'input' | 'cachedInput' | 'output' | 'perImage' | 'dimensions' | 'context' | 'deployments';

export interface DeploymentErrors {
  provider?: string;
  id?: string;
}

export interface ModelFormErrors {
  fields: Partial<Record<ModelFormField, string>>;
  deployments: Record<number, DeploymentErrors>;
}

export type ModelFormResult = { ok: true; key: string; spec: ModelSpec } | { ok: false; errors: ModelFormErrors };

export interface ModelFormContext {
  mode: EditorMode;
  takenKeys: readonly string[];
  providerKeys: readonly string[];
}

export function emptyModelForm(): ModelForm {
  return {
    key: '',
    label: '',
    version: '',
    input: null,
    cachedInput: null,
    output: null,
    perImage: null,
    tools: false,
    structuredOutput: 'prompt',
    vision: false,
    imageOutput: false,
    dimensions: null,
    context: null,
    reasoning: 'none',
    efforts: [],
    promptCache: 'none',
    sampling: true,
    deployments: [{ rowId: 0, provider: '', id: '' }],
  };
}

export function modelFormOf(model: ModelEntry): ModelForm {
  const { capabilities, pricePerMTok } = model;
  return {
    key: model.key,
    label: model.label,
    version: model.version ?? '',
    input: pricePerMTok.input,
    cachedInput: pricePerMTok.cachedInput ?? null,
    output: pricePerMTok.output,
    perImage: pricePerMTok.perImage ?? null,
    tools: capabilities.tools,
    structuredOutput: capabilities.structuredOutput,
    vision: capabilities.vision,
    imageOutput: capabilities.imageOutput === true,
    dimensions: capabilities.embedding?.dimensions ?? null,
    context: capabilities.context ?? null,
    reasoning: capabilities.reasoning,
    efforts: [...(capabilities.efforts ?? [])],
    promptCache: capabilities.promptCache,
    sampling: capabilities.sampling,
    deployments: model.deployments.map((deployment, rowId) => ({ rowId, provider: deployment.provider, id: deployment.id })),
  };
}

export function sortEfforts(efforts: readonly string[]): Effort[] {
  return EFFORTS.filter(effort => efforts.includes(effort));
}

export function reasoningPatch(reasoning: ReasoningMode, efforts: readonly Effort[]): Pick<ModelForm, 'reasoning' | 'efforts'> {
  return { reasoning, efforts: reasoning === 'none' ? [] : [...efforts] };
}

export function addDeploymentRow(rows: readonly DeploymentRow[]): DeploymentRow[] {
  const rowId = rows.reduce((highest, row) => Math.max(highest, row.rowId), -1) + 1;
  return [...rows, { rowId, provider: '', id: '' }];
}

export function moveRow<T>(rows: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return [...rows];
  const next = [...rows];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

function priceError(value: number | null, required: boolean, missing: string): string | undefined {
  if (value === null) return required ? missing : undefined;
  if (!Number.isFinite(value)) return 'Enter a number';
  return value < 0 ? "A price can't be negative" : undefined;
}

function countError(value: number | null, missing?: string): string | undefined {
  if (value === null) return missing;
  return Number.isInteger(value) && value >= 1 ? undefined : 'Use a whole number of at least 1';
}

function keyError(key: string, context: ModelFormContext): string | undefined {
  if (context.mode.kind === 'edit') return undefined;
  if (key === '') return 'Enter a key';
  if (!CATALOG_KEY_PATTERN.test(key)) return CATALOG_KEY_HINT;
  return context.takenKeys.includes(key) ? 'Another model already uses this key' : undefined;
}

function deploymentErrors(rows: readonly DeploymentRow[], providerKeys: readonly string[]): Record<number, DeploymentErrors> {
  const seen = new Set<string>();
  const errors: Record<number, DeploymentErrors> = {};
  for (const row of rows) {
    const id = row.id.trim();
    const pair = `${row.provider}\u0000${id}`;
    const provider = row.provider === '' ? 'Pick a provider' : providerKeys.includes(row.provider) ? undefined : "This provider isn't in the catalog";
    const idError = id === '' ? "Enter the provider's model id" : seen.has(pair) ? 'This provider and model id are already listed' : undefined;
    seen.add(pair);
    if (provider || idError) errors[row.rowId] = { ...(provider && { provider }), ...(idError && { id: idError }) };
  }
  return errors;
}

function specOf(form: ModelForm, input: number, output: number): ModelSpec {
  const version = form.version.trim();
  return {
    label: form.label.trim(),
    ...(version !== '' && { version }),
    capabilities: {
      tools: form.tools,
      structuredOutput: form.structuredOutput,
      vision: form.vision,
      ...(form.imageOutput && { imageOutput: true }),
      ...(form.dimensions !== null && { embedding: { dimensions: form.dimensions } }),
      ...(form.context !== null && { context: form.context }),
      reasoning: form.reasoning,
      ...(form.efforts.length > 0 && { efforts: [...form.efforts] }),
      promptCache: form.promptCache,
      sampling: form.sampling,
    },
    pricePerMTok: {
      input,
      ...(form.cachedInput !== null && { cachedInput: form.cachedInput }),
      output,
      ...(form.perImage !== null && { perImage: form.perImage }),
    },
    deployments: form.deployments.map(row => ({ provider: row.provider, id: row.id.trim() })),
  };
}

export function validateModelForm(form: ModelForm, context: ModelFormContext): ModelFormResult {
  const key = context.mode.kind === 'edit' ? context.mode.key : form.key.trim();
  const candidates: Partial<Record<ModelFormField, string | undefined>> = {
    key: keyError(key, context),
    label: form.label.trim() === '' ? 'Enter a name' : undefined,
    input: priceError(form.input, true, 'Enter the input price'),
    cachedInput: priceError(form.cachedInput, false, ''),
    output: priceError(form.output, true, 'Enter the output price'),
    perImage: priceError(form.perImage, false, ''),
    dimensions: countError(form.dimensions),
    context: countError(form.context),
    deployments: form.deployments.length === 0 ? 'Add at least one provider' : undefined,
  };
  const fields = Object.fromEntries(Object.entries(candidates).filter(([, message]) => message !== undefined)) as ModelFormErrors['fields'];
  const deployments = deploymentErrors(form.deployments, context.providerKeys);
  if (Object.keys(fields).length > 0 || Object.keys(deployments).length > 0 || form.input === null || form.output === null) {
    return { ok: false, errors: { fields, deployments } };
  }
  return { ok: true, key, spec: specOf(form, form.input, form.output) };
}

export type EditableField = Exclude<keyof ModelForm, 'key'>;

const EDITABLE_FIELDS: readonly EditableField[] = [
  'label',
  'version',
  'input',
  'cachedInput',
  'output',
  'perImage',
  'tools',
  'structuredOutput',
  'vision',
  'imageOutput',
  'dimensions',
  'context',
  'reasoning',
  'efforts',
  'promptCache',
  'sampling',
  'deployments',
];

type Entry = Record<string, unknown>;

export const CONCURRENT_MODEL_CHANGE = 'Someone else changed this model while you were editing. Reopen it to see their change.';

function projection(form: ModelForm, field: EditableField): unknown {
  return field === 'deployments' ? form.deployments.map(row => ({ provider: row.provider, id: row.id })) : form[field];
}

export function editedFields(initial: ModelForm, form: ModelForm): EditableField[] {
  return EDITABLE_FIELDS.filter(field => !isSameValue(projection(initial, field), projection(form, field)));
}

function withField(entry: Entry, field: string, value: unknown): Entry {
  if (value !== undefined) return { ...entry, [field]: value };
  const { [field]: _removed, ...rest } = entry;
  return rest;
}

function storedModel(document: CatalogDocument, key: string): { models: Entry; raw: Entry } | null {
  const models = document.models;
  const raw = isRecord(models) ? ownEntry(models, key) : undefined;
  return isRecord(models) && isRecord(raw) ? { models, raw } : null;
}

function recordOf(value: unknown): Entry {
  return isRecord(value) ? value : {};
}

/** Writes only the edited fields over the stored entry, so whatever the form cannot show (unknown fields, an explicit `false`, a malformed row) survives. */
function patchEntry(raw: Entry, fields: readonly EditableField[], spec: ModelSpec): Entry {
  let entry = raw;
  let capabilities = recordOf(raw.capabilities);
  let prices = recordOf(raw.pricePerMTok);
  const wanted = spec.capabilities;
  const embedding = wanted.embedding ? { ...recordOf(capabilities.embedding), dimensions: wanted.embedding.dimensions } : undefined;
  for (const field of fields) {
    if (field === 'label' || field === 'version') entry = withField(entry, field, spec[field]);
    else if (field === 'deployments')
      entry = withField(
        entry,
        field,
        spec.deployments.map(deployment => ({ provider: deployment.provider, id: deployment.id })),
      );
    else if (field === 'input' || field === 'cachedInput' || field === 'output' || field === 'perImage') prices = withField(prices, field, spec.pricePerMTok[field]);
    else if (field === 'dimensions') capabilities = withField(capabilities, 'embedding', embedding);
    else if (field === 'imageOutput') capabilities = withField(capabilities, field, wanted.imageOutput);
    else capabilities = withField(capabilities, field, wanted[field]);
  }
  return { ...entry, capabilities, pricePerMTok: prices };
}

export function addModelEdit(key: string, spec: ModelSpec): CatalogEdit {
  return (document: CatalogDocument): DocumentEdit => {
    if (modelKeysOf(document).includes(key)) return { ok: false, reason: `The catalog already has a model with the key "${key}"` };
    return withModel(document, key, spec);
  };
}

/**
 * Applied to the live catalog as it is when confirmed (and again on a conflict retry): a field the editor left alone keeps whatever is stored now, and a field
 * the editor changed is refused if someone else changed it too since the form opened.
 */
export function updateModelEdit(key: string, initial: ModelForm, form: ModelForm, spec: ModelSpec): CatalogEdit {
  const fields = editedFields(initial, form);
  const isAsOpened = (document: CatalogDocument): boolean => {
    const stored = storedModel(document, key);
    const fresh = stored ? readModels({ models: Object.fromEntries([[key, stored.raw]]) })[0] : undefined;
    const current = fresh ? modelFormOf(fresh) : undefined;
    return current !== undefined && fields.every(field => isSameValue(projection(current, field), projection(initial, field)));
  };
  const patch = (document: CatalogDocument): DocumentEdit => {
    const stored = storedModel(document, key);
    if (!stored) return { ok: false, reason: `The catalog no longer has the model "${key}"; someone may have removed it` };
    if (fields.length === 0) return { ok: true, document };
    return { ok: true, document: { ...document, models: { ...stored.models, [key]: patchEntry(stored.raw, fields, spec) } } };
  };
  return compareAndSet(patch, isAsOpened, CONCURRENT_MODEL_CHANGE);
}

/** Checked again on the catalog the removal is applied to, since a feature or model name may have started using the model meanwhile. */
export function removeModelEdit(key: string): CatalogEdit {
  return (document: CatalogDocument): DocumentEdit => {
    const usage = usageOf(modelUsageIndex(document), key);
    if (isInUse(usage)) return { ok: false, reason: `It is still in use. ${usageSentence(usage)}.` };
    return withoutModel(document, key);
  };
}
