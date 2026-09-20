export type PluginFieldType = 'string' | 'number' | 'boolean';

export type PluginFieldWidget = 'input' | 'textarea' | 'checkbox' | 'select';

export interface PluginFormField {
  name: string;
  type: PluginFieldType;
  title: string;
  description?: string;
  options?: string[];
  widget: PluginFieldWidget;
  default?: string | number | boolean;
}

export interface PluginForm {
  fields: PluginFormField[];
  required: string[];
}

export type PluginFormValues = Record<string, string | boolean>;

const FIELD_TYPES: PluginFieldType[] = ['string', 'number', 'boolean'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.every(item => typeof item === 'string') ? (value as string[]) : undefined;
}

function toScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

/** Type and `enum` already determine every widget but one, so the manifest's choice only decides input against textarea. */
function widgetFor(declared: unknown, type: PluginFieldType, options?: string[]): PluginFieldWidget {
  if (type === 'boolean') return 'checkbox';
  if (options) return 'select';
  return declared === 'textarea' ? 'textarea' : 'input';
}

function parseField(value: unknown): PluginFormField | undefined {
  if (!isRecord(value)) return undefined;
  const name = value['name'];
  const type = FIELD_TYPES.find(candidate => candidate === value['type']);
  if (typeof name !== 'string' || name === '' || !type) return undefined;

  const title = value['title'];
  const description = value['description'];
  const options = type === 'string' ? toStringArray(value['enum']) : undefined;
  return {
    name,
    type,
    title: typeof title === 'string' && title !== '' ? title : name,
    description: typeof description === 'string' ? description : undefined,
    options,
    widget: widgetFor(value['widget'], type, options),
    default: toScalar(value['default']),
  };
}

/**
 * `PluginManifestResponse.forms` is opaque on the wire — the generated types cannot express a form whose
 * fields carry a `string | number | boolean` default — so the shape is narrowed here instead. A form that
 * does not parse is no form at all rather than a broken tab.
 */
export function parsePluginForm(forms: Record<string, unknown> | undefined, name: string): PluginForm | undefined {
  const form = forms?.[name];
  if (!isRecord(form) || !Array.isArray(form['fields'])) return undefined;

  const fields = form['fields'].map(parseField).filter((field): field is PluginFormField => field !== undefined);
  if (fields.length === 0) return undefined;
  return { fields, required: toStringArray(form['required']) ?? [] };
}

export function pluginFormValues(form: PluginForm, config: Record<string, unknown>): PluginFormValues {
  const values: PluginFormValues = {};
  for (const field of form.fields) {
    const stored = toScalar(config[field.name]) ?? field.default;
    values[field.name] = field.type === 'boolean' ? stored === true : stored === undefined ? '' : String(stored);
  }
  return values;
}

export function pluginFormConfig(form: PluginForm, values: PluginFormValues): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of form.fields) {
    const value = values[field.name];
    if (field.type === 'boolean') {
      config[field.name] = value === true;
      continue;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '') continue;
    config[field.name] = field.type === 'number' ? Number(text) : text;
  }
  return config;
}

/** The rules the host re-checks server-side, run first so the common mistakes never cost a PLG_003 round trip. */
export function pluginFormErrors(form: PluginForm, values: PluginFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const required = new Set(form.required);
  for (const field of form.fields) {
    if (field.type === 'boolean') continue;
    const value = values[field.name];
    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '') {
      if (required.has(field.name)) errors[field.name] = 'Required';
      continue;
    }
    if (field.type === 'number' && !Number.isFinite(Number(text))) errors[field.name] = 'Must be a number';
    else if (field.options && !field.options.includes(text)) errors[field.name] = 'Not one of the accepted values';
  }
  return errors;
}
