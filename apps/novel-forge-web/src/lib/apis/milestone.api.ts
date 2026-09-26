import { queryOptions, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { type ListMilestonesResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

const milestoneKeys = {
  all: (projectId: string) => ['projects', projectId, 'milestones'] as const,
};

export const listMilestonesQueryOptions = (projectId: string): UseQueryOptions<ListMilestonesResponse, ApiError> =>
  queryOptions<ListMilestonesResponse, ApiError>({
    queryKey: milestoneKeys.all(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/milestones`).execute(),
  });

export function useListMilestonesQuery(projectId: string, enabled = true): UseQueryResult<ListMilestonesResponse, ApiError> {
  return useQuery({ ...listMilestonesQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}
