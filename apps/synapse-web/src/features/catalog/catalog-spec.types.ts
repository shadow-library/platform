export const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const CAPABILITIES = ['tools', 'structured_output', 'vision', 'streaming', 'image_output', 'embedding'] as const;
export const TASK_KINDS = ['chat', 'embedding', 'image'] as const;
export const DATA_POLICIES = ['any', 'in_cluster_only'] as const;
export const ALIAS_STATES = ['active', 'hidden', 'retired'] as const;
export const PROVIDER_KINDS = ['openai', 'ollama', 'mock'] as const;
export const PROVIDER_FLAVORS = ['openrouter', 'subscription-gateway', 'openai-compatible'] as const;
export const PROVIDER_LOCALITIES = ['in_cluster', 'host', 'third_party'] as const;
export const PROVIDER_COSTS = ['zero', 'metered'] as const;
export const PROVIDER_FEATURES = ['sessions', 'native_web_search', 'image_input'] as const;
export const BUDGET_SCOPES = ['subject', 'app'] as const;
export const BUDGET_WINDOWS = ['1h', '1d', '30d'] as const;
export const REASONING_MODES = ['none', 'optional', 'mandatory'] as const;

export type KeyedSection = 'tasks' | 'aliases' | 'models' | 'providers';

/** The fields the server's parser knows on each keyed entry; anything else is an `unknown_field`. */
export const ENTRY_FIELDS: Readonly<Record<KeyedSection, readonly string[]>> = {
  tasks: ['label', 'description', 'kind', 'requires', 'effort', 'dataPolicy', 'aliases', 'pinned', 'routes'],
  aliases: ['label', 'description', 'model', 'showVersion', 'state', 'available'],
  models: ['label', 'version', 'capabilities', 'pricePerMTok', 'deployments'],
  providers: ['kind', 'flavor', 'url', 'credential', 'apiKeyConfig', 'locality', 'cost', 'features', 'maxInflightPerReplica'],
};

export type Effort = (typeof EFFORTS)[number];
export type Capability = (typeof CAPABILITIES)[number];
export type TaskKind = (typeof TASK_KINDS)[number];
export type DataPolicy = (typeof DATA_POLICIES)[number];
export type AliasState = (typeof ALIAS_STATES)[number];
export type ProviderKind = (typeof PROVIDER_KINDS)[number];
export type ProviderFlavor = (typeof PROVIDER_FLAVORS)[number];
export type ProviderLocality = (typeof PROVIDER_LOCALITIES)[number];
export type ProviderCost = (typeof PROVIDER_COSTS)[number];
export type ProviderFeature = (typeof PROVIDER_FEATURES)[number];
export type BudgetScope = (typeof BUDGET_SCOPES)[number];
export type BudgetWindow = (typeof BUDGET_WINDOWS)[number];
export type ReasoningMode = (typeof REASONING_MODES)[number];

export type Selectors = Record<string, string>;

export interface TaskEffort {
  default: Effort;
  min?: Effort;
  max?: Effort;
}

export interface TaskRoute {
  /** Absent marks the default route */
  when?: Selectors;
  model: string;
}

export interface ModelCapabilities {
  tools: boolean;
  structuredOutput: 'native' | 'prompt';
  vision: boolean;
  imageOutput?: boolean;
  embedding?: { dimensions: number };
  context?: number;
  reasoning: ReasoningMode;
  efforts?: Effort[];
  promptCache: 'anthropic' | 'none';
  sampling: boolean;
}

export interface ModelPrice {
  input: number;
  cachedInput?: number;
  output: number;
  perImage?: number;
}

export interface ModelDeployment {
  provider: string;
  id: string;
}

export interface TaskEntry {
  key: string;
  app: string;
  name: string;
  kind: TaskKind;
  label?: string;
  description?: string;
  requires: Capability[];
  effort?: TaskEffort;
  dataPolicy: DataPolicy;
  aliases: string[];
  pinned: boolean;
  routes: TaskRoute[];
}

export interface AliasSpec {
  label: string;
  description?: string;
  model: string;
  state: AliasState;
  showVersion: boolean;
  available?: Record<string, string[]>;
}

export interface AliasEntry extends AliasSpec {
  key: string;
}

export interface ModelSpec {
  label: string;
  version?: string;
  capabilities: ModelCapabilities;
  pricePerMTok: ModelPrice;
  /** Failover order */
  deployments: ModelDeployment[];
}

export interface ModelEntry extends ModelSpec {
  key: string;
}

/** Fields a draft may hold invalid while it is being edited are optional here, read as "not set". */
export interface ProviderSpec {
  kind?: ProviderKind;
  flavor?: ProviderFlavor;
  url: string;
  credential?: string;
  apiKeyConfig?: string;
  locality?: ProviderLocality;
  cost?: ProviderCost;
  features: ProviderFeature[];
  maxInflightPerReplica?: number;
}

export interface ProviderEntry extends ProviderSpec {
  key: string;
}

export interface BudgetSpec {
  app: string;
  per: BudgetScope;
  window: BudgetWindow;
  maxCalls?: number;
  maxListCostUsd?: number;
}

export interface BudgetEntry extends BudgetSpec {
  /** Position in the document's `budgets` array, counting the malformed entries the reader skipped */
  index: number;
}
