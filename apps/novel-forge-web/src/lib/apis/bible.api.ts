import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type BibleSection, type ListBibleDocResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * Story Bible documents, addressed by section + slug. A missing document is a
 * normal state (404) — the screens treat it as "not written yet".
 */
const bibleKeys = {
  list: (projectId: string) => ['projects', projectId, 'bible', 'list'] as const,
  doc: (projectId: string, section: BibleSection, slug: string) => ['projects', projectId, 'bible', section, slug] as const,
};

export function useListBibleDocsQuery(projectId: string, enabled = true): UseQueryResult<ListBibleDocResponse, ApiError> {
  return useQuery<ListBibleDocResponse, ApiError>({
    queryKey: bibleKeys.list(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}
