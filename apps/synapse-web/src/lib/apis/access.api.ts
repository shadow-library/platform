import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import { type AdminAccessResponse } from './api-types.gen';
import { sessionKeys } from './session.api';
import { type ApiError, APIRequest } from './transport';

/** Keyed under the session so whatever refreshes or clears the session refreshes this too. */
export const accessQueryOptions = (): UseQueryOptions<AdminAccessResponse, ApiError> =>
  queryOptions<AdminAccessResponse, ApiError>({
    queryKey: [...sessionKeys.session, 'synapse-access'],
    queryFn: ({ signal }) => APIRequest.get('/admin/access').signal(signal).execute(),
    staleTime: 60_000,
  });
