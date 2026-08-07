import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { type ContinuityProposalResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

export function useProposeContinuityMutation(projectId: string): UseMutationResult<ContinuityProposalResponse, ApiError, number> {
  const queryClient = useQueryClient();
  return useMutation<ContinuityProposalResponse, ApiError, number>({
    mutationFn: n => APIRequest.post(`/projects/${projectId}/chapters/${n}/propose-continuity`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'review-queue'] }),
  });
}
