import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { applyCatalogChange, invalidateCatalogReads, rollbackCatalog, versionQueryOptions, versionsQueryOptions } from '@/lib';

import {
  type CatalogEdit,
  changeErrorMessage,
  type ChangeOutcome,
  type ChangePreview,
  type LiveCatalog,
  previewChange,
  previewRestore,
  type RestorePreview,
  runCatalogChange,
  runRestore,
} from './catalog-change';
import { activeVersionOf, type CatalogDocument, EMPTY_CATALOG } from './catalog-document';

export interface CatalogChanger {
  preview: (edit: CatalogEdit) => Promise<ChangePreview>;
  apply: (edit: CatalogEdit, note: string, base?: LiveCatalog) => Promise<ChangeOutcome>;
  previewRestore: (version: number, expectedLive: number) => Promise<RestorePreview | { kind: 'failed'; message: string }>;
  restore: (version: number, target: CatalogDocument, expectedVersion: number) => Promise<ChangeOutcome>;
}

/** Always read fresh: a change made on a stale copy is refused as a conflict, and a stale preview would describe the wrong change. */
export async function loadLiveCatalog(queryClient: QueryClient): Promise<LiveCatalog> {
  const versions = await queryClient.fetchQuery({ ...versionsQueryOptions(), staleTime: 0 });
  const active = activeVersionOf(versions.items);
  if (!active) return { version: null, document: EMPTY_CATALOG };
  const detail = await queryClient.fetchQuery(versionQueryOptions(active.version));
  return { version: detail.version, document: detail.document };
}

export function useCatalogChange(): CatalogChanger {
  const queryClient = useQueryClient();
  const loadLive = (): Promise<LiveCatalog> => loadLiveCatalog(queryClient);

  const preview = async (edit: CatalogEdit): Promise<ChangePreview> => {
    try {
      return previewChange(await loadLive(), edit);
    } catch (error) {
      return { kind: 'failed', message: changeErrorMessage(error) };
    }
  };

  const apply = async (edit: CatalogEdit, note: string, base?: LiveCatalog): Promise<ChangeOutcome> => {
    const outcome = await runCatalogChange({ loadLive, apply: applyCatalogChange }, edit, note, base);
    await invalidateCatalogReads(queryClient);
    return outcome;
  };

  const previewVersion = async (version: number, expectedLive: number): Promise<RestorePreview | { kind: 'failed'; message: string }> => {
    try {
      const [live, target] = await Promise.all([loadLive(), queryClient.fetchQuery(versionQueryOptions(version))]);
      const preview = previewRestore(live, target.document, expectedLive);
      if (preview.kind === 'conflict') await invalidateCatalogReads(queryClient);
      return preview;
    } catch (error) {
      return { kind: 'failed', message: changeErrorMessage(error) };
    }
  };

  const restore = async (version: number, target: CatalogDocument, expectedVersion: number): Promise<ChangeOutcome> => {
    const outcome = await runRestore({ loadLive, rollback: rollbackCatalog }, version, target, expectedVersion);
    await invalidateCatalogReads(queryClient);
    return outcome;
  };

  return { preview, apply, previewRestore: previewVersion, restore };
}
