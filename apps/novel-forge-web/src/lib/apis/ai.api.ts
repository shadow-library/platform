/**
 * Importing npm packages
 */
import { queryOptions, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type AiModelsResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * The AI model registry: every routable model (with its provider) plus the subprocess CLI providers,
 * and the active profile's per-role defaults. Backs the project settings model picker so provider and
 * model never drift from what the server's router can actually resolve.
 */
const aiKeys = {
  models: () => ['ai', 'models'] as const,
};

export const aiModelsQueryOptions = (): UseQueryOptions<AiModelsResponse, ApiError> =>
  queryOptions<AiModelsResponse, ApiError>({
    queryKey: aiKeys.models(),
    queryFn: () => APIRequest.get('/ai/models').execute(),
    staleTime: 5 * 60 * 1000,
  });

export function useAiModelsQuery(): UseQueryResult<AiModelsResponse, ApiError> {
  return useQuery(aiModelsQueryOptions());
}
