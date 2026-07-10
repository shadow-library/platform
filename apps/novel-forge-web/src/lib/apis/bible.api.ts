/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type BibleDocResponse, type BibleSection, type ListBibleDocResponse, type UpsertBibleDocBody } from './api-types.gen';

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

export function useBibleDocQuery(projectId: string, section: BibleSection, slug: string, enabled = true): UseQueryResult<BibleDocResponse, ApiError> {
  return useQuery<BibleDocResponse, ApiError>({
    queryKey: bibleKeys.doc(projectId, section, slug),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible/${section}/${slug}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(slug),
    retry: false,
  });
}

export function useUpsertBibleDocMutation(projectId: string, section: BibleSection, slug: string): UseMutationResult<BibleDocResponse, ApiError, UpsertBibleDocBody> {
  const queryClient = useQueryClient();
  return useMutation<BibleDocResponse, ApiError, UpsertBibleDocBody>({
    mutationFn: data => APIRequest.put(`/projects/${projectId}/bible/${section}/${slug}`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bibleKeys.doc(projectId, section, slug) }),
  });
}
