import { isDeepStrictEqual } from 'node:util';

import { credentialIssues, credentialReferences } from './catalog-credentials';
import { parseCatalogDocument } from './catalog-parser';
import {
  type CatalogDocument,
  type CatalogIssue,
  type CatalogIssueCode,
  compareEffort,
  type CredentialState,
  type Effort,
  EFFORTS,
  isDefaultRoute,
  modelServesKind,
  type ModelSpec,
  modelSupports,
  type TaskEffort,
  type TaskSpec,
} from './catalog.types';
import { childPath, itemPath, ownEntry } from './catalog.utils';

export type CatalogCheck = { valid: true; document: CatalogDocument } | { valid: false; issues: CatalogIssue[] };

export type CredentialLookup = (ids: readonly string[]) => Promise<CredentialState[]>;

interface ModelReference {
  path: string;
  modelKey: string;
}

class CatalogValidator {
  readonly issues: CatalogIssue[] = [];

  constructor(
    private readonly document: CatalogDocument,
    private readonly active: CatalogDocument | null,
  ) {}

  validate(): CatalogIssue[] {
    this.validateProviders();
    this.validateModels();
    this.validateAliases();
    for (const [taskKey, task] of Object.entries(this.document.tasks)) this.validateTask(childPath('tasks', taskKey), taskKey, task);
    this.validateBudgets();
    this.validateHistory();
    return this.issues;
  }

  private validateProviders(): void {
    for (const [providerKey, provider] of Object.entries(this.document.providers)) {
      const path = childPath('providers', providerKey);
      const flavorPath = childPath(path, 'flavor');
      if (provider.kind === 'openai' && !provider.flavor) this.report(flavorPath, 'missing_field', 'An openai provider must name its flavor');
      if (provider.kind !== 'openai' && provider.flavor) this.report(flavorPath, 'invalid_value', `Only an openai provider takes a flavor, not a ${provider.kind} one`);
      if (!provider.credential) continue;
      const credentialPath = childPath(path, 'credential');
      if (provider.apiKeyConfig) this.report(credentialPath, 'invalid_value', 'Name either a credential or an apiKeyConfig, not both');
      if (provider.kind === 'ollama') this.report(credentialPath, 'invalid_value', 'An ollama provider never sends a credential');
    }
  }

  private validateModels(): void {
    for (const [modelKey, model] of Object.entries(this.document.models)) {
      const path = childPath(childPath('models', modelKey), 'deployments');
      if (model.deployments.length === 0) this.report(path, 'no_deployments', `Model '${modelKey}' has no deployments`);
      model.deployments.forEach((deployment, index) => {
        if (!ownEntry(this.document.providers, deployment.provider)) {
          this.report(childPath(itemPath(path, index), 'provider'), 'unknown_provider', `Unknown provider '${deployment.provider}'`);
        }
      });
    }
  }

  private validateAliases(): void {
    for (const [aliasKey, alias] of Object.entries(this.document.aliases)) {
      if (!ownEntry(this.document.models, alias.model)) this.report(childPath(childPath('aliases', aliasKey), 'model'), 'unknown_model', `Unknown model '${alias.model}'`);
    }
  }

  private validateTask(path: string, taskKey: string, task: TaskSpec): void {
    const routesPath = childPath(path, 'routes');
    const defaults = task.routes.filter(isDefaultRoute).length;
    if (task.routes.length === 0) this.report(routesPath, 'no_routes', 'A task needs at least one route');
    else if (defaults !== 1) this.report(routesPath, 'default_route_count', `A task needs exactly one route without selectors, found ${defaults}`);
    if (task.effort) this.validateEffortOrder(childPath(path, 'effort'), task.effort);

    task.routes.forEach((route, index) => {
      const reference = { path: childPath(itemPath(routesPath, index), 'model'), modelKey: route.model };
      const model = ownEntry(this.document.models, route.model);
      if (model) this.validateModelForTask(reference, model, task);
      else this.report(reference.path, 'unknown_model', `Unknown model '${route.model}'`);
    });

    task.aliases?.forEach((aliasKey, index) => {
      const aliasPath = itemPath(childPath(path, 'aliases'), index);
      const alias = ownEntry(this.document.aliases, aliasKey);
      const model = alias && alias.state !== 'retired' ? ownEntry(this.document.models, alias.model) : undefined;
      if (!alias) this.report(aliasPath, 'unknown_alias', `Unknown alias '${aliasKey}'`);
      else if (model) this.validateModelForTask({ path: aliasPath, modelKey: alias.model }, model, task);
    });

    const activeTask = this.active ? ownEntry(this.active.tasks, taskKey) : undefined;
    if (this.active && activeTask && (task.pinned || activeTask.pinned)) this.validatePinned(path, task, this.active, activeTask);
  }

  private validateEffortOrder(path: string, effort: TaskEffort): void {
    const { min = EFFORTS[0] as Effort, max = EFFORTS[EFFORTS.length - 1] as Effort } = effort;
    if (compareEffort(min, effort.default) > 0 || compareEffort(effort.default, max) > 0) {
      this.report(path, 'effort_unordered', `Effort must satisfy min <= default <= max in the order ${EFFORTS.join(' < ')}`);
    }
  }

  private validateModelForTask(reference: ModelReference, model: ModelSpec, task: TaskSpec): void {
    const { path, modelKey } = reference;
    for (const capability of task.requires) {
      if (!modelSupports(model, capability)) this.report(path, 'missing_capability', `Model '${modelKey}' lacks the '${capability}' capability the task requires`);
    }
    if (!modelServesKind(model, task.kind)) this.report(path, 'kind_mismatch', `Model '${modelKey}' cannot serve a ${task.kind} task`);

    if (task.dataPolicy !== 'in_cluster_only') return;
    for (const deployment of model.deployments) {
      const provider = ownEntry(this.document.providers, deployment.provider);
      if (provider && provider.locality !== 'in_cluster') {
        this.report(path, 'data_policy_violation', `Model '${modelKey}' is deployed on '${deployment.provider}' (${provider.locality}), outside the cluster`);
      }
    }
  }

  private validatePinned(path: string, task: TaskSpec, active: CatalogDocument, activeTask: TaskSpec): void {
    if (activeTask.pinned && !task.pinned) this.report(childPath(path, 'pinned'), 'pinned_changed', 'A pinned task stays pinned; serve a different model under a new task id');
    const reachable = reachableModels(this.document, task);
    if (!isDeepStrictEqual(normaliseRoutes(task), normaliseRoutes(activeTask))) {
      this.report(childPath(path, 'routes'), 'pinned_changed', 'A pinned task cannot change its routes: stored vectors depend on their models');
    } else if (!isDeepStrictEqual(reachable, reachableModels(active, activeTask))) {
      this.report(childPath(path, 'aliases'), 'pinned_changed', 'A pinned task cannot reach a different set of models through its aliases');
    }
    for (const modelKey of reachable) {
      const model = ownEntry(this.document.models, modelKey);
      const activeModel = ownEntry(active.models, modelKey);
      if (model && activeModel && !isDeepStrictEqual(embeddingFingerprint(model), embeddingFingerprint(activeModel))) {
        this.report(childPath('models', modelKey), 'pinned_changed', `Model '${modelKey}' serves a pinned task, so its dimensions and deployment ids cannot change`);
      }
    }
  }

  private validateBudgets(): void {
    const apps = new Set(Object.keys(this.document.tasks).map(taskKey => taskKey.slice(0, taskKey.indexOf('.'))));
    this.document.budgets.forEach((budget, index) => {
      const path = itemPath('budgets', index);
      if (budget.maxCalls === undefined && budget.maxListCostUsd === undefined) this.report(path, 'budget_without_limit', 'A budget needs maxCalls, maxListCostUsd or both');
      if (!apps.has(budget.app)) this.report(childPath(path, 'app'), 'unknown_app', `No task belongs to app '${budget.app}', so the budget would never apply`);
    });
  }

  private validateHistory(): void {
    if (!this.active) return;
    for (const taskKey of Object.keys(this.active.tasks)) {
      if (!ownEntry(this.document.tasks, taskKey))
        this.report(childPath('tasks', taskKey), 'task_removed', `Task '${taskKey}' is published and apps depend on it; it cannot be removed`);
    }
    for (const aliasKey of Object.keys(this.active.aliases)) {
      if (!ownEntry(this.document.aliases, aliasKey)) {
        this.report(childPath('aliases', aliasKey), 'alias_removed', `Alias '${aliasKey}' is published and stored pins depend on it; retire it instead`);
      }
    }
  }

  private report(path: string, code: CatalogIssueCode, message: string): void {
    this.issues.push({ path, code, message });
  }
}

function normaliseRoutes(task: TaskSpec): { when: Record<string, string>; model: string }[] {
  return task.routes.map(route => ({ when: route.when ?? {}, model: route.model }));
}

function reachableModels(document: CatalogDocument, task: TaskSpec): string[] {
  const models = new Set(task.routes.map(route => route.model));
  for (const aliasKey of task.aliases ?? []) {
    const alias = ownEntry(document.aliases, aliasKey);
    if (alias && alias.state !== 'retired') models.add(alias.model);
  }
  return [...models].sort();
}

function embeddingFingerprint(model: ModelSpec): { dimensions: number | undefined; ids: string[] } {
  const ids = [...new Set(model.deployments.map(deployment => deployment.id))].sort();
  return { dimensions: model.capabilities.embedding?.dimensions, ids };
}

/** Every publish-time rule; the history rules (removed keys, pinned tasks) apply only when an active document is given. */
export function validateCatalog(document: CatalogDocument, active: CatalogDocument | null): CatalogIssue[] {
  return new CatalogValidator(document, active).validate();
}

export function checkCatalogDocument(input: unknown, active: CatalogDocument | null): CatalogCheck {
  const parsed = parseCatalogDocument(input);
  if (!parsed.ok) return { valid: false, issues: parsed.issues };
  const issues = validateCatalog(parsed.document, active);
  if (issues.length > 0) return { valid: false, issues };
  return { valid: true, document: parsed.document };
}

/** `checkCatalogDocument` plus the rules that need the credentials table; what publish, rollback and a draft's issues apply. */
export async function checkPublishable(input: unknown, active: CatalogDocument | null, lookup: CredentialLookup): Promise<CatalogCheck> {
  const parsed = parseCatalogDocument(input);
  if (!parsed.ok) return { valid: false, issues: parsed.issues };
  const states = await lookup([...credentialReferences(parsed.document).keys()]);
  const issues = [...validateCatalog(parsed.document, active), ...credentialIssues(parsed.document, states)];
  if (issues.length > 0) return { valid: false, issues };
  return { valid: true, document: parsed.document };
}
