import { type QueryClient } from '@tanstack/react-query';

import { type CatalogEdit } from '@/features/catalog/catalog-change';
import { activeVersionOf, type CatalogDocument, EMPTY_CATALOG, formatCatalog } from '@/features/catalog/catalog-document';
import { isSameValue } from '@/features/catalog/catalog-values';
import { versionQueryOptions, versionsQueryOptions } from '@/lib';

export interface EditorSource {
  text: string;
  /** `null` when no version is live yet and the text starts from an empty catalog */
  version: number | null;
  document: CatalogDocument;
}

export const CATALOG_CHANGED = 'Someone else changed the catalog since you opened it.';

export function editorSourceOf(live: { version: number; document: CatalogDocument } | null): EditorSource {
  const document = live?.document ?? EMPTY_CATALOG;
  return { text: formatCatalog(document), version: live?.version ?? null, document };
}

/** The text replaces the whole document, so it applies only to the version it was loaded from; a rebase would silently revert someone else's change. */
export function wholeDocumentEdit(source: EditorSource, next: CatalogDocument): CatalogEdit {
  return document => (isSameValue(document, source.document) ? { ok: true, document: next } : { ok: false, reason: CATALOG_CHANGED });
}

export async function fetchEditorSource(queryClient: QueryClient): Promise<EditorSource> {
  const versions = await queryClient.fetchQuery({ ...versionsQueryOptions(), staleTime: 0 });
  const active = activeVersionOf(versions.items);
  const detail = active ? await queryClient.fetchQuery(versionQueryOptions(active.version)) : null;
  return editorSourceOf(detail);
}
