import { PROVIDER_CREDENTIAL_KEYS } from '@server/constants';

import {
  type AliasSpec,
  type AliasState,
  type BudgetScope,
  type BudgetSpec,
  type BudgetWindow,
  type Capability,
  type CatalogDocument,
  type CatalogIssue,
  type CatalogIssueCode,
  type DataPolicy,
  EFFORTS,
  type ModelCapabilities,
  type ModelDeployment,
  type ModelPrice,
  type ModelSpec,
  type ProviderCost,
  type ProviderFeature,
  type ProviderFlavor,
  type ProviderKind,
  type ProviderLocality,
  type ProviderSpec,
  type TaskEffort,
  type TaskKind,
  type TaskRoute,
  type TaskSpec,
} from './catalog.types';
import { childPath, isRecord, itemPath } from './catalog.utils';

export type CatalogParseResult = { ok: true; document: CatalogDocument } | { ok: false; issues: CatalogIssue[] };

type Reader<T> = (value: unknown, path: string) => T;

interface NumberRule {
  integer?: boolean;
  min: number;
}

const KEY_PATTERN = /^[A-Za-z0-9][\w.:/@-]*$/;
const TASK_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9._-]*$/;
const URL_PROTOCOLS = ['http:', 'https:'];
const CREDENTIAL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CREDENTIAL_KEYS: readonly string[] = PROVIDER_CREDENTIAL_KEYS;

function keysOf<T extends string>(values: Record<T, true>): readonly T[] {
  return Object.keys(values) as T[];
}

const PROVIDER_KINDS = keysOf<ProviderKind>({ openai: true, ollama: true, mock: true });
const FLAVORS = keysOf<ProviderFlavor>({ openrouter: true, 'subscription-gateway': true, 'openai-compatible': true });
const LOCALITIES = keysOf<ProviderLocality>({ in_cluster: true, host: true, third_party: true });
const COSTS = keysOf<ProviderCost>({ zero: true, metered: true });
const FEATURES = keysOf<ProviderFeature>({ sessions: true, native_web_search: true, image_input: true });
const STRUCTURED_OUTPUT = keysOf<ModelCapabilities['structuredOutput']>({ native: true, prompt: true });
const REASONING = keysOf<ModelCapabilities['reasoning']>({ none: true, optional: true, mandatory: true });
const PROMPT_CACHE = keysOf<ModelCapabilities['promptCache']>({ anthropic: true, none: true });
const ALIAS_STATES = keysOf<AliasState>({ active: true, hidden: true, retired: true });
const TASK_KINDS = keysOf<TaskKind>({ chat: true, embedding: true, image: true });
const CAPABILITIES = keysOf<Capability>({ tools: true, structured_output: true, vision: true, streaming: true, image_output: true, embedding: true });
const DATA_POLICIES = keysOf<DataPolicy>({ any: true, in_cluster_only: true });
const BUDGET_SCOPES = keysOf<BudgetScope>({ subject: true, app: true });
const BUDGET_WINDOWS = keysOf<BudgetWindow>({ '1h': true, '1d': true, '30d': true });

const DOCUMENT_FIELDS = keysOf<keyof CatalogDocument>({ providers: true, models: true, aliases: true, tasks: true, budgets: true });
const PROVIDER_FIELDS = keysOf<keyof ProviderSpec>({
  kind: true,
  flavor: true,
  url: true,
  credential: true,
  apiKeyConfig: true,
  locality: true,
  cost: true,
  features: true,
  maxInflightPerReplica: true,
});
const MODEL_FIELDS = keysOf<keyof ModelSpec>({ label: true, version: true, capabilities: true, pricePerMTok: true, deployments: true });
const CAPABILITY_FIELDS = keysOf<keyof ModelCapabilities>({
  tools: true,
  structuredOutput: true,
  vision: true,
  imageOutput: true,
  embedding: true,
  context: true,
  reasoning: true,
  efforts: true,
  promptCache: true,
  sampling: true,
});
const EMBEDDING_FIELDS = keysOf<keyof NonNullable<ModelCapabilities['embedding']>>({ dimensions: true });
const PRICE_FIELDS = keysOf<keyof ModelPrice>({ input: true, cachedInput: true, output: true, perImage: true });
const DEPLOYMENT_FIELDS = keysOf<keyof ModelDeployment>({ provider: true, id: true });
const ALIAS_FIELDS = keysOf<keyof AliasSpec>({ label: true, description: true, model: true, showVersion: true, state: true, available: true });
const TASK_FIELDS = keysOf<keyof TaskSpec>({ kind: true, requires: true, effort: true, dataPolicy: true, aliases: true, pinned: true, routes: true });
const EFFORT_FIELDS = keysOf<keyof TaskEffort>({ default: true, min: true, max: true });
const ROUTE_FIELDS = keysOf<keyof TaskRoute>({ when: true, model: true });
const BUDGET_FIELDS = keysOf<keyof BudgetSpec>({ app: true, per: true, window: true, maxCalls: true, maxListCostUsd: true });

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

class Fields {
  constructor(
    private readonly value: Record<string, unknown>,
    private readonly path: string,
  ) {}

  required<T>(key: string, read: Reader<T>): T {
    return read(this.value[key], childPath(this.path, key));
  }

  optional<T>(key: string, read: Reader<T>): T | undefined {
    const value = this.value[key];
    return value === undefined ? undefined : read(value, childPath(this.path, key));
  }
}

/** Readers always return a value of their type so the document can be assembled in one pass; it is discarded whenever an issue was reported. */
class CatalogParser {
  readonly issues: CatalogIssue[] = [];
  private muted = 0;

  readonly text: Reader<string> = (value, path) => {
    if (typeof value !== 'string') return this.mismatch(value, path, 'a string', '');
    if (value.trim() === '') this.report(path, 'invalid_value', 'Must not be empty');
    return value;
  };

  readonly flag: Reader<boolean> = (value, path) => (typeof value === 'boolean' ? value : this.mismatch(value, path, 'a boolean', false));

  document(value: unknown): CatalogDocument {
    return this.object(value, '', DOCUMENT_FIELDS, fields => ({
      providers: fields.required('providers', this.record(KEY_PATTERN, this.provider)),
      models: fields.required('models', this.record(KEY_PATTERN, this.model)),
      aliases: fields.required('aliases', this.record(KEY_PATTERN, this.alias)),
      tasks: fields.required('tasks', this.record(TASK_KEY_PATTERN, this.task)),
      budgets: fields.required('budgets', this.array(this.budget)),
    }));
  }

  private readonly provider: Reader<ProviderSpec> = (value, path) =>
    this.object(value, path, PROVIDER_FIELDS, fields => ({
      kind: fields.required('kind', this.literal(PROVIDER_KINDS)),
      flavor: fields.optional('flavor', this.literal(FLAVORS)),
      url: fields.required('url', this.url),
      credential: fields.optional('credential', this.credentialId),
      apiKeyConfig: fields.optional('apiKeyConfig', this.configKey),
      locality: fields.required('locality', this.literal(LOCALITIES)),
      cost: fields.required('cost', this.literal(COSTS)),
      features: fields.optional('features', this.array(this.literal(FEATURES))),
      maxInflightPerReplica: fields.optional('maxInflightPerReplica', this.number({ integer: true, min: 1 })),
    }));

  private readonly model: Reader<ModelSpec> = (value, path) =>
    this.object(value, path, MODEL_FIELDS, fields => ({
      label: fields.required('label', this.text),
      version: fields.optional('version', this.text),
      capabilities: fields.required('capabilities', this.capabilities),
      pricePerMTok: fields.required('pricePerMTok', this.price),
      deployments: fields.required('deployments', this.array(this.deployment)),
    }));

  private readonly capabilities: Reader<ModelCapabilities> = (value, path) =>
    this.object(value, path, CAPABILITY_FIELDS, fields => ({
      tools: fields.required('tools', this.flag),
      structuredOutput: fields.required('structuredOutput', this.literal(STRUCTURED_OUTPUT)),
      vision: fields.required('vision', this.flag),
      imageOutput: fields.optional('imageOutput', this.flag),
      embedding: fields.optional('embedding', (embedding, embeddingPath) =>
        this.object(embedding, embeddingPath, EMBEDDING_FIELDS, embeddingFields => ({
          dimensions: embeddingFields.required('dimensions', this.number({ integer: true, min: 1 })),
        })),
      ),
      context: fields.optional('context', this.number({ integer: true, min: 1 })),
      reasoning: fields.required('reasoning', this.literal(REASONING)),
      efforts: fields.optional('efforts', this.nonEmpty(this.array(this.literal(EFFORTS)))),
      promptCache: fields.required('promptCache', this.literal(PROMPT_CACHE)),
      sampling: fields.required('sampling', this.flag),
    }));

  private readonly price: Reader<ModelPrice> = (value, path) =>
    this.object(value, path, PRICE_FIELDS, fields => ({
      input: fields.required('input', this.number({ min: 0 })),
      cachedInput: fields.optional('cachedInput', this.number({ min: 0 })),
      output: fields.required('output', this.number({ min: 0 })),
      perImage: fields.optional('perImage', this.number({ min: 0 })),
    }));

  private readonly deployment: Reader<ModelDeployment> = (value, path) =>
    this.object(value, path, DEPLOYMENT_FIELDS, fields => ({
      provider: fields.required('provider', this.text),
      id: fields.required('id', this.text),
    }));

  private readonly alias: Reader<AliasSpec> = (value, path) =>
    this.object(value, path, ALIAS_FIELDS, fields => ({
      label: fields.required('label', this.text),
      description: fields.optional('description', this.text),
      model: fields.required('model', this.text),
      showVersion: fields.optional('showVersion', this.flag),
      state: fields.required('state', this.literal(ALIAS_STATES)),
      available: fields.optional('available', this.record(KEY_PATTERN, this.array(this.text))),
    }));

  private readonly task: Reader<TaskSpec> = (value, path) =>
    this.object(value, path, TASK_FIELDS, fields => ({
      kind: fields.required('kind', this.literal(TASK_KINDS)),
      requires: fields.required('requires', this.array(this.literal(CAPABILITIES))),
      effort: fields.optional('effort', this.effort),
      dataPolicy: fields.required('dataPolicy', this.literal(DATA_POLICIES)),
      aliases: fields.optional('aliases', this.array(this.text)),
      pinned: fields.optional('pinned', this.flag),
      routes: fields.required('routes', this.array(this.route)),
    }));

  private readonly effort: Reader<TaskEffort> = (value, path) =>
    this.object(value, path, EFFORT_FIELDS, fields => ({
      default: fields.required('default', this.literal(EFFORTS)),
      min: fields.optional('min', this.literal(EFFORTS)),
      max: fields.optional('max', this.literal(EFFORTS)),
    }));

  private readonly route: Reader<TaskRoute> = (value, path) =>
    this.object(value, path, ROUTE_FIELDS, fields => ({
      when: fields.optional('when', this.record(KEY_PATTERN, this.text)),
      model: fields.required('model', this.text),
    }));

  private readonly budget: Reader<BudgetSpec> = (value, path) =>
    this.object(value, path, BUDGET_FIELDS, fields => ({
      app: fields.required('app', this.text),
      per: fields.required('per', this.literal(BUDGET_SCOPES)),
      window: fields.required('window', this.literal(BUDGET_WINDOWS)),
      maxCalls: fields.optional('maxCalls', this.number({ integer: true, min: 0 })),
      maxListCostUsd: fields.optional('maxListCostUsd', this.number({ min: 0 })),
    }));

  private readonly url: Reader<string> = (value, path) => {
    const url = this.text(value, path);
    if (url === '') return url;
    const parsed = URL.canParse(url) ? new URL(url) : undefined;
    if (!parsed || !URL_PROTOCOLS.includes(parsed.protocol)) this.report(path, 'invalid_value', 'Expected an http or https URL');
    else if (parsed.username || parsed.password) this.report(path, 'invalid_value', 'A URL must not embed credentials; name a stored credential instead');
    return url;
  };

  private readonly credentialId: Reader<string> = (value, path) => {
    const id = this.text(value, path);
    if (id !== '' && !CREDENTIAL_ID_PATTERN.test(id)) this.report(path, 'invalid_value', 'Expected the id of a stored credential');
    return id;
  };

  private readonly configKey: Reader<string> = (value, path) => {
    const key = this.text(value, path);
    if (key !== '' && !CREDENTIAL_KEYS.includes(key)) this.report(path, 'invalid_value', `Expected one of the provider credential keys ${CREDENTIAL_KEYS.join(', ')}`);
    return key;
  };

  private literal<T extends string>(allowed: readonly T[]): Reader<T> {
    return (value, path) => {
      if (typeof value !== 'string') return this.mismatch(value, path, 'a string', allowed[0] as T);
      if (!allowed.includes(value as T)) this.report(path, 'invalid_value', `Expected one of ${allowed.join(', ')}`);
      return value as T;
    };
  }

  private number(rule: NumberRule): Reader<number> {
    return (value, path) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return this.mismatch(value, path, 'a finite number', rule.min);
      if (rule.integer && !Number.isInteger(value)) this.report(path, 'invalid_value', 'Expected an integer');
      if (value < rule.min) this.report(path, 'invalid_value', `Expected at least ${rule.min}`);
      return value;
    };
  }

  private array<T>(read: Reader<T>): Reader<T[]> {
    return (value, path) => (Array.isArray(value) ? value.map((item, index) => read(item, itemPath(path, index))) : this.mismatch(value, path, 'an array', []));
  }

  private nonEmpty<T>(read: Reader<T[]>): Reader<T[]> {
    return (value, path) => {
      const items = read(value, path);
      if (Array.isArray(value) && items.length === 0) this.report(path, 'invalid_value', 'Must not be empty');
      return items;
    };
  }

  /** Built through `Object.fromEntries`, which defines own properties, so a `__proto__` key in admin JSON can never reach the prototype. */
  private record<T>(keyPattern: RegExp, read: Reader<T>): Reader<Record<string, T>> {
    return (value, path) => {
      if (!isRecord(value)) return this.mismatch(value, path, 'an object', {});
      const entries = Object.entries(value).map(([key, item]): [string, T] => {
        const entryPath = childPath(path, key);
        if (!keyPattern.test(key)) this.report(entryPath, 'invalid_key', `Invalid key '${key}'`);
        return [key, read(item, entryPath)];
      });
      return Object.fromEntries(entries);
    };
  }

  private object<T extends object>(value: unknown, path: string, known: readonly string[], build: (fields: Fields) => T): T {
    if (!isRecord(value)) {
      this.mismatch(value, path, 'an object', undefined);
      this.muted++;
      try {
        return build(new Fields({}, path));
      } finally {
        this.muted--;
      }
    }
    for (const key of Object.keys(value)) if (!known.includes(key)) this.report(childPath(path, key), 'unknown_field', `Unknown field '${key}'`);
    return compact(build(new Fields(value, path)));
  }

  private mismatch<T>(value: unknown, path: string, expected: string, fallback: T): T {
    if (value === undefined) this.report(path, 'missing_field', 'Required');
    else this.report(path, 'invalid_type', `Expected ${expected}`);
    return fallback;
  }

  private report(path: string, code: CatalogIssueCode, message: string): void {
    if (this.muted === 0) this.issues.push({ path, code, message });
  }
}

/** Narrows JSON from the database or an admin to a `CatalogDocument`, rejecting unknown fields at every level so a misspelt key never passes silently. */
export function parseCatalogDocument(input: unknown): CatalogParseResult {
  const parser = new CatalogParser();
  const document = parser.document(input);
  if (parser.issues.length > 0) return { ok: false, issues: parser.issues };
  return { ok: true, document };
}
