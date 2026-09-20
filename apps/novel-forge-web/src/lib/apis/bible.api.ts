import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type BibleDocResponse, type BibleReadinessResponse, type BibleSection, type ListBibleDocResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * Story Bible documents, addressed by section + slug. A missing document is a
 * normal state (404) — the screens treat it as "not written yet".
 */
const bibleKeys = {
  list: (projectId: string) => ['projects', projectId, 'bible', 'list'] as const,
  doc: (projectId: string, section: BibleSection, slug: string) => ['projects', projectId, 'bible', section, slug] as const,
  readiness: (projectId: string) => ['projects', projectId, 'bible', 'readiness'] as const,
};

export function useListBibleDocsQuery(projectId: string, enabled = true): UseQueryResult<ListBibleDocResponse, ApiError> {
  return useQuery<ListBibleDocResponse, ApiError>({
    queryKey: bibleKeys.list(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useBibleDocQuery(projectId: string, section: BibleSection | undefined, slug: string | undefined): UseQueryResult<BibleDocResponse, ApiError> {
  return useQuery<BibleDocResponse, ApiError>({
    queryKey: bibleKeys.doc(projectId, section as BibleSection, slug ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible/${section}/${slug}`).execute(),
    enabled: Boolean(projectId) && Boolean(section) && Boolean(slug),
  });
}

export function useBibleReadinessQuery(projectId: string, enabled = true): UseQueryResult<BibleReadinessResponse, ApiError> {
  return useQuery<BibleReadinessResponse, ApiError>({
    queryKey: bibleKeys.readiness(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible/readiness`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}
