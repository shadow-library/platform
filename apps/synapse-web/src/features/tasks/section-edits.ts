import { type CatalogDocument, type DocumentEdit } from '@/features/catalog/catalog-document';
import { type TaskMeta, withTaskAliases, withTaskDataPolicy, withTaskFieldValue, withTaskMeta } from '@/features/catalog/catalog-edits';
import { type DataPolicy } from '@/features/catalog/catalog-spec.types';
import { isRecord, isSameValue, ownEntry } from '@/features/catalog/catalog-values';
import { type CatalogEdit } from '@/features/catalog/draft-edit';

import { type EffortForm, effortOf } from './effort-range';
import { type AboutForm } from './feature-detail';
import { routesFromRouting, type RoutingDraft } from './route-rules';

export type FeatureSection = 'about' | 'routing' | 'effort' | 'aliases' | 'dataPolicy';

/** Raw values of a task's fields, as stored; a field the task lacks is `undefined`. */
export type TaskFields = Record<string, unknown>;

export const SECTION_FIELDS: Readonly<Record<FeatureSection, readonly string[]>> = {
  about: ['label', 'description'],
  routing: ['routes'],
  effort: ['effort'],
  aliases: ['aliases'],
  dataPolicy: ['dataPolicy'],
};

export const SECTION_CHANGED = 'Someone else changed this section while you were editing. Reopen it to see their change.';

export function rawTaskFields(document: CatalogDocument, taskKey: string, fields: readonly string[]): TaskFields {
  const tasks = document.tasks;
  const task = isRecord(tasks) ? ownEntry(tasks, taskKey) : undefined;
  return Object.fromEntries(fields.map(field => [field, isRecord(task) ? ownEntry(task, field) : undefined]));
}

/** A compare-and-set per section: each one replaces its fields whole, so it applies only while they still hold what the editor opened with. */
export function guardedTaskEdit(taskKey: string, fields: readonly string[], opened: TaskFields, edit: CatalogEdit): CatalogEdit {
  return document => (isSameValue(rawTaskFields(document, taskKey, fields), opened) ? edit(document) : { ok: false, reason: SECTION_CHANGED });
}

const keep = (document: CatalogDocument): DocumentEdit => ({ ok: true, document });

/** Only fields the person changed are sent, so an untouched one, however it is stored, stays as it is. */
export function aboutEdit(taskKey: string, opened: AboutForm, form: AboutForm): CatalogEdit {
  const meta: TaskMeta = { ...(form.label !== opened.label && { label: form.label }), ...(form.description !== opened.description && { description: form.description }) };
  return document => (Object.keys(meta).length === 0 ? keep(document) : withTaskMeta(document, taskKey, meta));
}

/** Keys of the stored effort object that this console does not model are kept. */
export function effortEdit(taskKey: string, opened: EffortForm, form: EffortForm): CatalogEdit {
  if (isSameValue(form, opened)) return keep;
  return document => {
    const effort = effortOf(form);
    if (!effort) return withTaskFieldValue(document, taskKey, 'effort', undefined);
    const stored = rawTaskFields(document, taskKey, ['effort']).effort;
    const { min: _min, max: _max, ...rest } = isRecord(stored) ? stored : {};
    return withTaskFieldValue(document, taskKey, 'effort', { ...rest, ...effort });
  };
}

export function routingEdit(taskKey: string, opened: unknown, draft: RoutingDraft): CatalogEdit {
  return document => {
    const routes = routesFromRouting(draft);
    return isSameValue(routes, opened) ? keep(document) : withTaskFieldValue(document, taskKey, 'routes', routes);
  };
}

export function aliasesEdit(taskKey: string, opened: readonly string[], selected: readonly string[]): CatalogEdit {
  return document => (isSameValue(selected, opened) ? keep(document) : withTaskAliases(document, taskKey, selected));
}

export function dataPolicyEdit(taskKey: string, opened: DataPolicy, policy: DataPolicy): CatalogEdit {
  return document => (policy === opened ? keep(document) : withTaskDataPolicy(document, taskKey, policy));
}
