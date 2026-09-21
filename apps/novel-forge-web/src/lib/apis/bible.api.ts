import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from '@shadow-library/ui';

import {
  type ApplyBibleTidyBody,
  type ApplyProposalResponse,
  type BibleDocResponse,
  type BibleReadinessResponse,
  type BibleSection,
  type BibleTidyPreviewResponse,
  type ListBibleDocResponse,
  type RevertProposalResponse,
} from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * Story Bible documents, addressed by section + slug. A missing document is a
 * normal state (404) — the screens treat it as "not written yet".
 */
const bibleKeys = {
  list: (projectId: string) => ['projects', projectId, 'bible', 'list'] as const,
  doc: (projectId: string, section: BibleSection, slug: string) => ['projects', projectId, 'bible', section, slug] as const,
  readiness: (projectId: string) => ['projects', projectId, 'bible', 'readiness'] as const,
  tidy: (projectId: string) => ['projects', projectId, 'bible', 'tidy'] as const,
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

export function useBibleTidyPreviewQuery(projectId: string, enabled = true): UseQueryResult<BibleTidyPreviewResponse, ApiError> {
  return useQuery<BibleTidyPreviewResponse, ApiError>({
    queryKey: bibleKeys.tidy(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible/tidy`).execute(),
    enabled: enabled && Boolean(projectId),
    staleTime: 0,
  });
}

export function useApplyBibleTidyMutation(projectId: string): UseMutationResult<ApplyProposalResponse, ApiError, ApplyBibleTidyBody> {
  const queryClient = useQueryClient();
  return useMutation<ApplyProposalResponse, ApiError, ApplyBibleTidyBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/bible/tidy`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
  });
}

/** Reports through the hook's own callbacks, which still run when the Undo is clicked after the dialog that offered it has gone. */
export function useUndoBibleTidyMutation(projectId: string): UseMutationResult<RevertProposalResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<RevertProposalResponse, ApiError, string>({
    mutationFn: proposalId => APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/revert`).execute(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Tidy-up undone');
    },
    onError: err => toast.danger(`Could not undo the tidy-up: ${err.message}`),
  });
}
