/**
 * Importing npm packages
 */
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import { type ImportPlanBody, type ImportPlanResponse } from './api-types.gen';

/**
 * Declaring the constants
 */

/**
 * Imports an offline-authored plan bundle (bible, entities, volumes, arcs, briefs) in one
 * transactional call. Everything plan-shaped may have changed, so success invalidates the
 * whole project subtree rather than cherry-picking query keys.
 */
export function useImportPlanMutation(projectId: string): UseMutationResult<ImportPlanResponse, ApiError, ImportPlanBody> {
  const queryClient = useQueryClient();
  return useMutation<ImportPlanResponse, ApiError, ImportPlanBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/plan/import`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
  });
}
