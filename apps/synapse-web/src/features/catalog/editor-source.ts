import { type QueryClient } from '@tanstack/react-query';

import { catalogKeys, draftQueryOptions, versionQueryOptions, versionsQueryOptions } from '@/lib';

import { activeVersionOf, type EditorSource, editorSourceOf } from './catalog-document';

/** What a save made now would replace: the current draft, or the active version when there is none. */
export async function fetchEditorSource(queryClient: QueryClient): Promise<EditorSource> {
  const [versions, draft] = await Promise.all([
    queryClient.fetchQuery({ ...versionsQueryOptions(), staleTime: 0 }),
    queryClient.fetchQuery({ ...draftQueryOptions(), staleTime: 0 }),
  ]);
  await queryClient.invalidateQueries({ queryKey: catalogKeys.diff() });
  const active = activeVersionOf(versions.items);
  const detail = active ? await queryClient.fetchQuery(versionQueryOptions(active.version)) : null;
  return editorSourceOf(draft, detail);
}
