/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type BriefResponse, type UpdateBriefBody } from './api-types.gen';

/**
 * Per-chapter briefs — the structured plan the writing step turns into prose.
 */
const briefKeys = {
  detail: (projectId: string, n: number) => ['projects', projectId, 'briefs', n] as const,
};

export function useBriefQuery(projectId: string, n: number | undefined, enabled = true): UseQueryResult<BriefResponse, ApiError> {
  return useQuery<BriefResponse, ApiError>({
    queryKey: briefKeys.detail(projectId, n ?? -1),
    queryFn: () => APIRequest.get(`/projects/${projectId}/briefs/${n}`).execute(),
    enabled: enabled && Boolean(projectId) && n !== undefined,
  });
}

export function useUpdateBriefMutation(projectId: string, n: number): UseMutationResult<BriefResponse, ApiError, UpdateBriefBody> {
  const queryClient = useQueryClient();
  return useMutation<BriefResponse, ApiError, UpdateBriefBody>({
    mutationFn: data => APIRequest.put(`/projects/${projectId}/briefs/${n}`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: briefKeys.detail(projectId, n) }),
  });
}
