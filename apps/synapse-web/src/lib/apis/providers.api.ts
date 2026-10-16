import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import { type ProvidersResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export const providerKeys = { all: ['providers'] } as const;

export const providersQueryOptions = (): UseQueryOptions<ProvidersResponse, ApiError> =>
  queryOptions<ProvidersResponse, ApiError>({
    queryKey: providerKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/admin/providers').signal(signal).execute(),
  });
