import { type CatalogVersionSummaryResponse } from '@/lib/apis/api-types.gen';

import { isRecord } from './catalog-values';

export type CatalogDocument = Record<string, unknown>;

export type ParsedCatalog = { ok: true; document: CatalogDocument } | { ok: false; error: string };

export type DocumentEdit = { ok: true; document: CatalogDocument } | { ok: false; reason: string };

export const EMPTY_CATALOG: CatalogDocument = { providers: {}, models: {}, aliases: {}, tasks: {}, budgets: [] };

export function formatCatalog(document: CatalogDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseCatalog(source: string): ParsedCatalog {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return { ok: false, error: error instanceof SyntaxError ? error.message : 'The text is not valid JSON' };
  }
  if (!isRecord(value)) return { ok: false, error: 'The catalog must be a JSON object' };
  return { ok: true, document: value };
}

/** The highest published version is the one replicas serve; the list arrives newest first but is not trusted to. */
export function activeVersionOf(versions: readonly CatalogVersionSummaryResponse[]): CatalogVersionSummaryResponse | undefined {
  return versions
    .filter(version => version.state === 'PUBLISHED')
    .reduce<CatalogVersionSummaryResponse | undefined>((best, version) => (!best || version.version > best.version ? version : best), undefined);
}

export function issuePathLabel(path: string): string {
  return path === '' ? '(whole catalog)' : path;
}
