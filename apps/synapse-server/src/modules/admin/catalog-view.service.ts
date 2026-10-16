import { type CatalogAliasView, type CatalogModelView, type CatalogResponse, type CatalogTaskView } from '@shadow-library/synapse';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

import {
  ActiveCatalogCache,
  type CatalogDocument,
  eligibleDeployments,
  isAliasAvailable,
  labelFor,
  type ModelSpec,
  type Selectors,
  selectRoute,
  type TaskSpec,
} from '@modules/catalog';
import { ownEntry } from '@modules/catalog/catalog.utils';

export interface CatalogView {
  version: number;
  body: CatalogResponse;
}

function priceOf(model: ModelSpec): Pick<CatalogModelView, 'price' | 'capabilities'> {
  return { price: structuredClone(model.pricePerMTok), capabilities: structuredClone(model.capabilities) };
}

function requireModel(document: CatalogDocument, modelKey: string): ModelSpec {
  const model = ownEntry(document.models, modelKey);
  if (!model) throw AppError.internal(`Catalog names unknown model '${modelKey}'`);
  return model;
}

function searchesNatively(document: CatalogDocument, task: TaskSpec, model: ModelSpec): boolean {
  const [first] = eligibleDeployments(document, task, model);
  return first?.provider.features?.includes('native_web_search') ?? false;
}

/** The app prefix is checked before the task is looked up, so a caller cannot probe which tasks of another app exist. */
@Injectable()
export class CatalogViewService {
  constructor(private readonly cache: ActiveCatalogCache) {}

  view(app: string, taskKey: string | undefined, selectors: Selectors): CatalogView {
    const { version, document } = this.cache.requireCurrent();
    if (taskKey === undefined) return { version, body: { catalog_version: version, tasks: this.appTasks(document, app, selectors) } };

    if (!taskKey.startsWith(`${app}.`)) throw AppErrorCode.SYN_TASK_FORBIDDEN.create({ task: taskKey });
    const task = ownEntry(document.tasks, taskKey) ?? AppErrorCode.SYN_UNKNOWN_TASK.throw({ task: taskKey });
    return { version, body: { catalog_version: version, task: taskKey, ...this.taskView(document, taskKey, task, selectors) } };
  }

  private appTasks(document: CatalogDocument, app: string, selectors: Selectors): Record<string, CatalogTaskView> {
    const tasks: Record<string, CatalogTaskView> = {};
    for (const [taskKey, task] of Object.entries(document.tasks)) if (taskKey.startsWith(`${app}.`)) tasks[taskKey] = this.taskView(document, taskKey, task, selectors);
    return tasks;
  }

  private taskView(document: CatalogDocument, taskKey: string, task: TaskSpec, selectors: Selectors): CatalogTaskView {
    const route = selectRoute(task, selectors) ?? AppErrorCode.SYN_NO_ELIGIBLE_MODEL.throw({ task: taskKey });
    const model = requireModel(document, route.model);
    return {
      default: { model: route.model, label: labelFor(undefined, model), ...priceOf(model) },
      aliases: this.aliasViews(document, task, selectors),
      native_web_search: searchesNatively(document, task, model),
    };
  }

  private aliasViews(document: CatalogDocument, task: TaskSpec, selectors: Selectors): CatalogAliasView[] {
    const views: CatalogAliasView[] = [];
    for (const key of task.aliases ?? []) {
      const alias = ownEntry(document.aliases, key);
      if (!alias || alias.state !== 'active' || !isAliasAvailable(alias, selectors)) continue;
      const model = requireModel(document, alias.model);
      views.push({
        key,
        label: labelFor(alias, model),
        ...(alias.description !== undefined && { description: alias.description }),
        model: alias.model,
        ...priceOf(model),
        state: alias.state,
        native_web_search: searchesNatively(document, task, model),
      });
    }
    return views;
  }
}
