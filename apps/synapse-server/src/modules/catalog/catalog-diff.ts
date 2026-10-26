import { isDeepStrictEqual } from 'node:util';

import { CATALOG_SECTIONS, type CatalogSection } from './catalog.types';
import { isRecord } from './catalog.utils';

const EMPTY_SECTIONS: Record<CatalogSection, unknown> = { providers: {}, models: {}, aliases: {}, tasks: {}, budgets: [], tools: {} };

function section(document: unknown, name: CatalogSection): unknown {
  const value = isRecord(document) ? document[name] : undefined;
  return value === undefined ? EMPTY_SECTIONS[name] : value;
}

/** Takes raw JSON so a change can be authorised before it parses; an absent section counts as empty on either side. */
export function changedSections(next: unknown, active: unknown): Set<CatalogSection> {
  return new Set(CATALOG_SECTIONS.filter(name => !isDeepStrictEqual(section(next, name), section(active, name))));
}
