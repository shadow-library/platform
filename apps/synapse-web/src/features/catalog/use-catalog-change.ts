import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { applyCatalogChange, invalidateCatalogReads, versionQueryOptions, versionsQueryOptions } from '@/lib';

import { type CatalogEdit, changeErrorMessage, type ChangeOutcome, type ChangePreview, type LiveCatalog, previewChange, runCatalogChange } from './catalog-change';
import { activeVersionOf, EMPTY_CATALOG } from './catalog-document';

export interface CatalogChanger {
  preview: (edit: CatalogEdit) => Promise<ChangePreview>;
  apply: (edit: CatalogEdit, note: string, base?: LiveCatalog) => Promise<ChangeOutcome>;
}

/** Always read fresh: a change made on a stale copy is refused as a conflict, and a stale preview would describe the wrong change. */
async function loadLive(queryClient: QueryClient): Promise<LiveCatalog> {
  const versions = await queryClient.fetchQuery({ ...versionsQueryOptions(), staleTime: 0 });
  const active = activeVersionOf(versions.items);
  if (!active) return { version: null, document: EMPTY_CATALOG };
  const detail = await queryClient.fetchQuery(versionQueryOptions(active.version));
  return { version: detail.version, document: detail.document };
}

export function useCatalogChange(): CatalogChanger {
  const queryClient = useQueryClient();
  const ports = { loadLive: () => loadLive(queryClient), apply: applyCatalogChange };

  const preview = async (edit: CatalogEdit): Promise<ChangePreview> => {
    try {
      return previewChange(await ports.loadLive(), edit);
    } catch (error) {
      return { kind: 'failed', message: changeErrorMessage(error) };
    }
  };

  const apply = async (edit: CatalogEdit, note: string, base?: LiveCatalog): Promise<ChangeOutcome> => {
    const outcome = await runCatalogChange(ports, edit, note, base);
    await invalidateCatalogReads(queryClient);
    return outcome;
  };

  return { preview, apply };
}
