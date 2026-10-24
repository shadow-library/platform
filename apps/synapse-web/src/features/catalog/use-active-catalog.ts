import { type QueryClient, useQuery } from '@tanstack/react-query';

import { type ApiError, draftQueryOptions, type DraftResponse, versionQueryOptions, versionsQueryOptions } from '@/lib';

import { activeVersionOf, type CatalogDocument } from './catalog-document';

export type ActiveCatalogState =
  { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'none' } | { status: 'ready'; version: number; document: CatalogDocument };

export type DraftState = { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'ready'; draft: DraftResponse | null };

export async function prefetchActiveCatalog(queryClient: QueryClient): Promise<void> {
  const versions = await queryClient.ensureQueryData(versionsQueryOptions());
  const active = activeVersionOf(versions.items);
  if (active) await queryClient.prefetchQuery(versionQueryOptions(active.version));
}

export function useActiveCatalog(enabled = true): ActiveCatalogState {
  const versions = useQuery({ ...versionsQueryOptions(), enabled });
  const active = versions.data ? activeVersionOf(versions.data.items) : undefined;
  const detail = useQuery({ ...versionQueryOptions(active?.version ?? 0), enabled: enabled && active !== undefined });
  if (versions.data && !active) return { status: 'none' };
  if (active && detail.data) return { status: 'ready', version: active.version, document: detail.data.document };
  const error = versions.error ?? detail.error;
  return error ? { status: 'error', error } : { status: 'loading' };
}

export function useDraft(enabled = true): DraftState {
  const draft = useQuery({ ...draftQueryOptions(), enabled });
  if (draft.data !== undefined) return { status: 'ready', draft: draft.data };
  return draft.error ? { status: 'error', error: draft.error } : { status: 'loading' };
}
