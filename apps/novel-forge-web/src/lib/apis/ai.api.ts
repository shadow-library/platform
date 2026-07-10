/**
 * Importing npm packages
 */
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type AiModelsResponse } from './api-types.gen';

/**
 * The AI model registry: every routable model (with its provider) plus the subprocess CLI providers,
 * and the active profile's per-role defaults. Backs the project settings model picker so provider and
 * model never drift from what the server's router can actually resolve.
 */
const aiKeys = {
  models: () => ['ai', 'models'] as const,
};

export function useAiModelsQuery(): UseQueryResult<AiModelsResponse, ApiError> {
  return useQuery<AiModelsResponse, ApiError>({
    queryKey: aiKeys.models(),
    queryFn: () => APIRequest.get('/ai/models').execute(),
    staleTime: 5 * 60 * 1000,
  });
}
