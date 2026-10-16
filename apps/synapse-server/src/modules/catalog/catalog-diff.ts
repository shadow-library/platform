import { isDeepStrictEqual } from 'node:util';

import { CATALOG_SECTIONS, type CatalogSection } from './catalog.types';
import { childPath, isRecord, itemPath } from './catalog.utils';

export interface CatalogDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

const EMPTY_SECTIONS: Record<CatalogSection, unknown> = { providers: {}, models: {}, aliases: {}, tasks: {}, budgets: [] };

function walk(draft: unknown, active: unknown, path: string, diff: CatalogDiff): void {
  if (isRecord(draft) && isRecord(active)) {
    for (const key of Object.keys(active)) if (!Object.hasOwn(draft, key)) diff.removed.push(childPath(path, key));
    for (const [key, value] of Object.entries(draft)) {
      if (Object.hasOwn(active, key)) walk(value, active[key], childPath(path, key), diff);
      else diff.added.push(childPath(path, key));
    }
    return;
  }
  if (Array.isArray(draft) && Array.isArray(active)) {
    const length = Math.max(draft.length, active.length);
    for (let index = 0; index < length; index++) {
      const indexPath = itemPath(path, index);
      if (index >= active.length) diff.added.push(indexPath);
      else if (index >= draft.length) diff.removed.push(indexPath);
      else walk(draft[index], active[index], indexPath, diff);
    }
    return;
  }
  if (!isDeepStrictEqual(draft, active)) diff.changed.push(path);
}

/** Paths are reported at the shallowest point of difference: a whole added task is one `added` path, not one per leaf. */
export function diffCatalog(draft: unknown, active: unknown): CatalogDiff {
  const diff: CatalogDiff = { added: [], removed: [], changed: [] };
  walk(draft, active ?? {}, '', diff);
  return diff;
}

function section(document: unknown, name: CatalogSection): unknown {
  const value = isRecord(document) ? document[name] : undefined;
  return value === undefined ? EMPTY_SECTIONS[name] : value;
}

/** Takes raw JSON so a draft can be authorised before it parses; an absent section counts as empty on either side. */
export function changedSections(draft: unknown, active: unknown): Set<CatalogSection> {
  return new Set(CATALOG_SECTIONS.filter(name => !isDeepStrictEqual(section(draft, name), section(active, name))));
}
