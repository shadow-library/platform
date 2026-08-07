import { queryOptions, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { type AiModelsResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

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
