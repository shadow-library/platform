/**
 * Importing npm packages
 */
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type ContinuityProposalResponse } from './api-types.gen';

/**
 * Continuity proposals are the AI's suggested canon edits for a single chapter, surfaced in the
 * review flow. The chapter editor's "ask Forge to revise" action asks the model to draft one; the
 * pending set is read from the review queue.
 */
export function useProposeContinuityMutation(projectId: string): UseMutationResult<ContinuityProposalResponse, ApiError, number> {
  const queryClient = useQueryClient();
  return useMutation<ContinuityProposalResponse, ApiError, number>({
    mutationFn: n => APIRequest.post(`/projects/${projectId}/chapters/${n}/propose-continuity`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'review-queue'] }),
  });
}
