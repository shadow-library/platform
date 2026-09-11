import { type Dirent, existsSync, readdirSync, readFileSync, type Stats, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { type ForgePlugin, type PluginAction, type PluginFactory, type PluginForm, type PluginFormField, type PluginHostApi, type PluginManifest } from './plugin.types';

export interface LoadedPlugin {
  id: string;
  manifest: PluginManifest;
  plugin: ForgePlugin;
}

export type PluginHostFactory = (pluginId: string) => PluginHostApi;

export const PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DECISION_POINTS = ['canon.augment', 'brief.policy', 'call.route', 'context.contribute', 'prompt.contribute'] as const;
export const CLAIMABLE_DECISION_POINTS = ['brief.policy', 'call.route'] as const;
export const FORM_FIELD_TYPES = ['string', 'number', 'boolean'] as const;
export const FORM_WIDGETS = ['input', 'textarea', 'checkbox', 'select'] as const;
export const ACTION_SURFACES = ['settings', 'chapter', 'volume', 'novel'] as const;

const MANIFEST_FILE = 'manifest.json';
const ENTRY_FILES = ['index.js', 'index.ts'] as const;

const logger = Logger.getLogger(APP_NAME, 'PluginLoader');

export class PluginLoadError extends Error {}

function fail(reason: string): never {
  throw new PluginLoadError(reason);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function requireString(record: Record<string, unknown>, key: string, at: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) fail(`${at}.${key} must be a non-empty string`);
  return value;
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], at: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail(`${at} must be one of ${allowed.join(', ')}`);
  return value as T;
}

function requireMember<T extends string>(record: Record<string, unknown>, key: string, allowed: readonly T[], at: string): T {
  return requireOneOf(record[key], allowed, `${at}.${key}`);
}

function validateFormField(raw: unknown, at: string): PluginFormField {
  if (!isRecord(raw)) fail(`${at} must be an object`);
  const field: PluginFormField = { name: requireString(raw, 'name', at), type: requireMember(raw, 'type', FORM_FIELD_TYPES, at), title: requireString(raw, 'title', at) };
  if (raw.description !== undefined) field.description = requireString(raw, 'description', at);
  if (raw.widget !== undefined) field.widget = requireMember(raw, 'widget', FORM_WIDGETS, at);
  if (raw.enum !== undefined) {
    if (!isStringArray(raw.enum)) fail(`${at}.enum must be an array of strings`);
    field.enum = [...raw.enum];
  }
  if (raw.default !== undefined) {
    const value = raw.default;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') fail(`${at}.default must be a string, number, or boolean`);
    field.default = value;
  }
  return field;
}

function validateForm(raw: unknown, at: string): PluginForm {
  if (!isRecord(raw)) fail(`${at} must be an object`);
  if (!Array.isArray(raw.fields)) fail(`${at}.fields must be an array`);
  const fields = raw.fields.map((field, index) => validateFormField(field, `${at}.fields[${index}]`));

  const names = new Set(fields.map(field => field.name));
  if (names.size !== fields.length) fail(`${at}.fields declares the same name twice`);
  if (raw.required === undefined) return { fields };
  if (!isStringArray(raw.required)) fail(`${at}.required must be an array of strings`);
  for (const name of raw.required) if (!names.has(name)) fail(`${at}.required names an undeclared field: ${name}`);
  return { fields, required: [...raw.required] };
}

function validateAction(raw: unknown, formNames: Set<string>, at: string): PluginAction {
  if (!isRecord(raw)) fail(`${at} must be an object`);
  const action: PluginAction = {
    id: requireString(raw, 'id', at),
    op: requireString(raw, 'op', at),
    label: requireString(raw, 'label', at),
    surface: requireMember(raw, 'surface', ACTION_SURFACES, at),
  };
  if (raw.form !== undefined) {
    const form = requireString(raw, 'form', at);
    if (!formNames.has(form)) fail(`${at}.form names an undeclared form: ${form}`);
    action.form = form;
  }
  return action;
}

export function validateManifest(raw: unknown, id: string): PluginManifest {
  const at = 'manifest';
  if (!isRecord(raw)) fail('manifest must be an object');
  if (requireString(raw, 'id', at) !== id) fail(`manifest.id "${String(raw.id)}" does not match the plugin directory "${id}"`);

  if (!Array.isArray(raw.decisionPoints)) fail(`${at}.decisionPoints must be an array`);
  const decisionPoints = raw.decisionPoints.map((point, index) => requireOneOf(point, DECISION_POINTS, `${at}.decisionPoints[${index}]`));
  if (new Set(decisionPoints).size !== decisionPoints.length) fail(`${at}.decisionPoints lists the same point twice`);

  if (!isRecord(raw.forms)) fail(`${at}.forms must be an object`);
  const forms = Object.fromEntries(Object.entries(raw.forms).map(([name, form]) => [name, validateForm(form, `${at}.forms.${name}`)]));

  const manifest: PluginManifest = {
    id,
    version: requireString(raw, 'version', at),
    title: requireString(raw, 'title', at),
    description: requireString(raw, 'description', at),
    decisionPoints,
    forms,
  };

  if (raw.exclusive !== undefined) {
    if (!Array.isArray(raw.exclusive)) fail(`${at}.exclusive must be an array`);
    const exclusive = raw.exclusive.map((point, index) => requireOneOf(point, CLAIMABLE_DECISION_POINTS, `${at}.exclusive[${index}]`));
    if (new Set(exclusive).size !== exclusive.length) fail(`${at}.exclusive lists the same point twice`);
    for (const point of exclusive) if (!decisionPoints.includes(point)) fail(`${at}.exclusive claims "${point}", which is not in decisionPoints`);
    manifest.exclusive = exclusive;
  }

  if (raw.actions !== undefined) {
    if (!Array.isArray(raw.actions)) fail(`${at}.actions must be an array`);
    const formNames = new Set(Object.keys(forms));
    const actions = raw.actions.map((action, index) => validateAction(action, formNames, `${at}.actions[${index}]`));
    if (new Set(actions.map(action => action.id)).size !== actions.length) fail(`${at}.actions declares the same id twice`);
    manifest.actions = actions;
  }

  return manifest;
}

function readManifestFile(dir: string): unknown {
  const file = path.join(dir, MANIFEST_FILE);
  if (!existsSync(file)) fail(`${MANIFEST_FILE} is missing`);
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (cause) {
    fail(`${MANIFEST_FILE} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

function findDisagreement(file: unknown, runtime: unknown, at: string): string | undefined {
  if (Array.isArray(file) || Array.isArray(runtime)) {
    if (!Array.isArray(file) || !Array.isArray(runtime) || file.length !== runtime.length) return at;
    for (const [index, item] of file.entries()) {
      const disagreement = findDisagreement(item, runtime[index], `${at}[${index}]`);
      if (disagreement) return disagreement;
    }
    return undefined;
  }

  if (isRecord(file) || isRecord(runtime)) {
    if (!isRecord(file) || !isRecord(runtime)) return at;
    for (const key of new Set([...Object.keys(file), ...Object.keys(runtime)])) {
      const disagreement = findDisagreement(file[key], runtime[key], `${at}.${key}`);
      if (disagreement) return disagreement;
    }
    return undefined;
  }

  return file === runtime ? undefined : at;
}

async function loadPlugin(dir: string, id: string, createHost: PluginHostFactory): Promise<LoadedPlugin> {
  if (!PLUGIN_ID_PATTERN.test(id)) fail(`directory name is not a valid plugin id (${PLUGIN_ID_PATTERN.source})`);
  // Checked before the entry is imported, so a mis-identified or malformed plugin never gets to execute.
  const manifest = validateManifest(readManifestFile(dir), id);

  const entry = ENTRY_FILES.map(name => path.join(dir, name)).find(candidate => existsSync(candidate));
  if (!entry) fail(`no entry file — expected one of ${ENTRY_FILES.join(', ')}`);

  const module = (await import(pathToFileURL(entry).href)) as { default?: unknown };
  if (typeof module.default !== 'function') fail(`${path.basename(entry)} does not default-export a createPlugin factory`);

  const created: unknown = (module.default as PluginFactory)(createHost(id));
  if (!isRecord(created)) fail('createPlugin did not return a plugin object');
  if (created.id !== id) fail(`plugin id "${String(created.id)}" does not match the plugin directory "${id}"`);
  if (typeof created.manifest !== 'function') fail('plugin does not implement manifest()');

  const plugin = created as unknown as ForgePlugin;
  const disagreement = findDisagreement(manifest, validateManifest(plugin.manifest(), id), 'manifest');
  if (disagreement) fail(`manifest() disagrees with ${MANIFEST_FILE} at ${disagreement}`);

  await plugin.onLoad?.();
  return { id, manifest, plugin };
}

function statOrSkip(target: string): Stats | undefined {
  try {
    return statSync(target);
  } catch {
    return undefined;
  }
}

/** `readdirSync` yields single path components, so no child entry can resolve outside `dir`. */
export async function loadPlugins(dir: string, createHost: PluginHostFactory): Promise<LoadedPlugin[]> {
  const root = path.resolve(dir);
  if (!statOrSkip(root)?.isDirectory()) {
    logger.warn('plugins.dir is not a directory — no plugins loaded', { dir: root });
    return [];
  }

  let children: Dirent[];
  try {
    children = readdirSync(root, { withFileTypes: true });
  } catch (cause) {
    logger.warn('plugins.dir could not be read — no plugins loaded', { dir: root, reason: cause instanceof Error ? cause.message : String(cause) });
    return [];
  }

  const loaded: LoadedPlugin[] = [];
  for (const entry of children.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!statOrSkip(path.join(root, entry.name))?.isDirectory()) {
      logger.debug('plugins.dir child is not a directory — skipped', { dir: root, entry: entry.name });
      continue;
    }
    try {
      loaded.push(await loadPlugin(path.join(root, entry.name), entry.name, createHost));
    } catch (cause) {
      logger.warn('plugin skipped', { pluginId: entry.name, reason: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  return loaded;
}
