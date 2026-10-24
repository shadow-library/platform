import { type CatalogCapabilities, type CatalogPrice, type SynapseAliasState, type SynapseEffort } from '@shadow-library/synapse';

export type Effort = SynapseEffort;

export type Capability = 'tools' | 'structured_output' | 'vision' | 'streaming' | 'image_output' | 'embedding';

export type ProviderKind = 'openai' | 'ollama' | 'mock';

export type ProviderFlavor = 'openrouter' | 'subscription-gateway' | 'openai-compatible';

export type ProviderLocality = 'in_cluster' | 'host' | 'third_party';

export type ProviderCost = 'zero' | 'metered';

export type ProviderFeature = 'sessions' | 'native_web_search' | 'image_input';

export type AliasState = SynapseAliasState;

export type TaskKind = 'chat' | 'embedding' | 'image';

export type DataPolicy = 'any' | 'in_cluster_only';

export type BudgetScope = 'subject' | 'app';

export type BudgetWindow = '1h' | '1d' | '30d';

export type Selectors = Record<string, string>;

export type ModelCapabilities = CatalogCapabilities;

export type ModelPrice = CatalogPrice;

export interface ProviderSpec {
  kind: ProviderKind;
  /** Required for kind `openai`, which several dialects share, and rejected on any other kind */
  flavor?: ProviderFlavor;
  url: string;
  /** Id of a stored provider credential, bound to the origin of `url` */
  credential?: string;
  /**
   * A Config key name, never a secret value. Mutually exclusive with `credential`.
   * @deprecated Kept for one release; name a stored `credential` instead.
   */
  apiKeyConfig?: string;
  locality: ProviderLocality;
  cost: ProviderCost;
  features?: ProviderFeature[];
  maxInflightPerReplica?: number;
}

export interface ModelDeployment {
  provider: string;
  id: string;
}

export interface ModelSpec {
  label: string;
  /** Shown only when an alias sets `showVersion` */
  version?: string;
  capabilities: ModelCapabilities;
  pricePerMTok: ModelPrice;
  /** Failover order */
  deployments: ModelDeployment[];
}

export interface AliasSpec {
  label: string;
  description?: string;
  model: string;
  showVersion?: boolean;
  state: AliasState;
  /** Every listed selector must be present in the request and carry one of its values */
  available?: Record<string, string[]>;
}

export interface TaskEffort {
  default: Effort;
  min?: Effort;
  max?: Effort;
}

export interface TaskRoute {
  /** Absent or empty marks the default route */
  when?: Selectors;
  model: string;
}

export interface TaskSpec {
  label?: string;
  description?: string;
  kind: TaskKind;
  requires: Capability[];
  effort?: TaskEffort;
  dataPolicy: DataPolicy;
  aliases?: string[];
  /** Route models may never change across versions, because stored vectors depend on them */
  pinned?: boolean;
  routes: TaskRoute[];
}

export interface BudgetSpec {
  app: string;
  per: BudgetScope;
  window: BudgetWindow;
  maxCalls?: number;
  maxListCostUsd?: number;
}

export interface CatalogDocument {
  providers: Record<string, ProviderSpec>;
  models: Record<string, ModelSpec>;
  aliases: Record<string, AliasSpec>;
  /** Keyed `<app>.<name>` */
  tasks: Record<string, TaskSpec>;
  budgets: BudgetSpec[];
}

export type CatalogSection = keyof CatalogDocument;

export type CatalogIssueCode =
  | 'invalid_type'
  | 'invalid_value'
  | 'invalid_key'
  | 'missing_field'
  | 'unknown_field'
  | 'unknown_provider'
  | 'unknown_model'
  | 'unknown_alias'
  | 'unknown_app'
  | 'missing_capability'
  | 'kind_mismatch'
  | 'effort_unordered'
  | 'data_policy_violation'
  | 'pinned_changed'
  | 'task_removed'
  | 'alias_removed'
  | 'no_routes'
  | 'default_route_count'
  | 'no_deployments'
  | 'budget_without_limit'
  | 'unknown_credential'
  | 'credential_revoked'
  | 'credential_origin_mismatch';

export interface CatalogIssue {
  /** e.g. `tasks.novel-forge.chat.routes[1].model`; empty for the document itself */
  path: string;
  message: string;
  code: CatalogIssueCode;
}

/** What publish needs to know of a stored credential: never its secret */
export interface CredentialState {
  id: string;
  allowedOrigin: string;
  revoked: boolean;
}

export interface ActiveCatalog {
  version: number;
  document: CatalogDocument;
}

export const CATALOG_SECTIONS: readonly CatalogSection[] = ['providers', 'models', 'aliases', 'tasks', 'budgets'];

export const EFFORTS: readonly Effort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export function effortRank(effort: Effort): number {
  return EFFORTS.indexOf(effort);
}

export function compareEffort(left: Effort, right: Effort): number {
  return effortRank(left) - effortRank(right);
}

/** `structured_output` always holds, since a model without native support gets the schema injected into its prompt; embedding endpoints never stream. */
export function modelSupports(model: ModelSpec, capability: Capability): boolean {
  const capabilities = model.capabilities;
  switch (capability) {
    case 'tools':
      return capabilities.tools;
    case 'structured_output':
      return true;
    case 'vision':
      return capabilities.vision;
    case 'streaming':
      return capabilities.embedding === undefined;
    case 'image_output':
      return capabilities.imageOutput === true;
    case 'embedding':
      return capabilities.embedding !== undefined;
  }
}

export function modelServesKind(model: ModelSpec, kind: TaskKind): boolean {
  if (kind === 'embedding') return model.capabilities.embedding !== undefined;
  if (kind === 'image') return model.capabilities.imageOutput === true;
  return model.capabilities.embedding === undefined;
}

export function isDefaultRoute(route: TaskRoute): boolean {
  return route.when === undefined || Object.keys(route.when).length === 0;
}
