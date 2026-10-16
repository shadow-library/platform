export type SynapseErrorCode =
  | 'SYN_UNKNOWN_TASK'
  | 'SYN_TASK_FORBIDDEN'
  | 'SYN_ALIAS_UNAVAILABLE'
  | 'SYN_NO_ELIGIBLE_MODEL'
  | 'SYN_BUDGET_CALLS'
  | 'SYN_BUDGET_COST'
  | 'SYN_POLICY_DENIED'
  | 'SYN_PROVIDERS_EXHAUSTED'
  | 'SYN_UPSTREAM_ERROR'
  | 'SYN_INVALID_REQUEST'
  | 'SYN_CATALOG_INVALID'
  | 'SYN_CATALOG_CONFLICT'
  | 'SYN_NO_ACTIVE_CATALOG'
  | 'SYN_TIMEOUT'
  | 'SYN_DUPLICATE_REQUEST';

/** Ordered from least to most reasoning */
export type SynapseEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type SynapseSubjectType = 'owner' | 'user' | 'app';

export type SynapseAliasState = 'active' | 'hidden' | 'retired';

/** Whom a call is made for; per-subject budgets count against it */
export interface SynapseSubject {
  type: SynapseSubjectType;
  id: string;
}

/** The `synapse` member every inference request carries beside the OpenAI fields, whose `model` names the task */
export interface SynapseEnvelope {
  /** Caller generated, at most 64 characters, unique across every call the app makes: a reused id is refused */
  request_id: string;
  subject: SynapseSubject;
  /** Values the task's routes and alias availability match on, e.g. `{ tier: 'balanced', content_mode: 'standard' }` */
  selectors?: Record<string, string>;
  /** An alias listed by the task; a retired one silently falls back to the task's routes */
  alias?: string;
  /** Clamped to the task's range, then snapped to the nearest effort the model supports */
  effort?: SynapseEffort;
  /** Continues a provider-side conversation where the provider keeps sessions; ignored elsewhere */
  session?: string;
  web_search?: boolean;
}

export interface SynapseCost {
  /** At catalog list price, whoever served the call; budgets count this */
  list_usd: number;
  /** What the provider charges: zero on a subscription or local deployment */
  billed_usd: number;
}

/** The `synapse` member of every inference response, and of the final choice-less frame of a stream */
export interface SynapseResponseBlock {
  request_id: string;
  task: string;
  alias: string | null;
  /** The alias label, carrying the model version only when the alias shows it, else the model label */
  label: string;
  model: string;
  provider: string;
  effort: SynapseEffort | null;
  /** Deployments tried, including the one that answered */
  attempts: number;
  catalog_version: number;
  cost: SynapseCost;
  /** `false` when web search was requested but the serving deployment could not run it */
  web_search?: boolean;
  /** Embeddings only */
  dimensions?: number;
}

export interface SynapseErrorBody {
  error: {
    message: string;
    type: string;
    /** A `SYN_*` code, or one from the auth guard or request validation on the same routes; narrow with `isSynapseErrorCode` */
    code: string;
    param?: string;
  };
}

/** List prices in USD per million tokens, or per image */
export interface CatalogPrice {
  input: number;
  cachedInput?: number;
  output: number;
  perImage?: number;
}

export interface CatalogCapabilities {
  tools: boolean;
  structuredOutput: 'native' | 'prompt';
  vision: boolean;
  imageOutput?: boolean;
  embedding?: { dimensions: number };
  context?: number;
  reasoning: 'none' | 'optional' | 'mandatory';
  efforts?: SynapseEffort[];
  promptCache: 'anthropic' | 'none';
  sampling: boolean;
}

export interface CatalogModelView {
  model: string;
  label: string;
  price: CatalogPrice;
  capabilities: CatalogCapabilities;
}

export interface CatalogAliasView {
  key: string;
  label: string;
  description?: string;
  /** The catalog model the alias targets, as the `model` of a response it serves */
  model: string;
  price: CatalogPrice;
  capabilities: CatalogCapabilities;
  state: SynapseAliasState;
  /** Whether the first eligible deployment of the alias's model is served by a provider with native web search */
  native_web_search: boolean;
}

export interface CatalogTaskView {
  /** The model the task's routes pick for the requested selectors */
  default: CatalogModelView;
  /** Only the active aliases available for the requested selectors */
  aliases: CatalogAliasView[];
  native_web_search: boolean;
}

export interface CatalogTaskResponse extends CatalogTaskView {
  catalog_version: number;
  task: string;
}

export interface CatalogAppResponse {
  catalog_version: number;
  tasks: Record<string, CatalogTaskView>;
}

/** `GET /api/v1/catalog` answers one task when `task` is given, else every task of the calling app */
export type CatalogResponse = CatalogTaskResponse | CatalogAppResponse;
