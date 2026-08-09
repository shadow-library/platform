import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  type AuthModeItem,
  type AuthModeListResponse,
  type CreateGlobalIdentityProviderBody,
  type GlobalIdentityProviderItem,
  type SetAuthModeBody,
  type UpdateGlobalIdentityProviderBody,
} from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export type { AuthModeItem, AuthModeListResponse, CreateGlobalIdentityProviderBody, GlobalIdentityProviderItem, SetAuthModeBody, UpdateGlobalIdentityProviderBody };
export type AuthMode = AuthModeItem['method'];
export type SocialProviderKind = GlobalIdentityProviderItem['kind'];

export const adminAuthModeKeys = {
  all: ['admin', 'auth-modes'] as const,
};

export const authModesQueryOptions = () =>
  queryOptions<AuthModeListResponse, ApiError>({
    queryKey: adminAuthModeKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/admin/auth-modes').signal(signal).execute<AuthModeListResponse>(),
  });

export function useAuthModesQuery(): UseQueryResult<AuthModeListResponse, ApiError> {
  return useQuery(authModesQueryOptions());
}

export function useSetAuthModeMutation(): UseMutationResult<undefined, ApiError, { method: AuthMode; body: SetAuthModeBody }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { method: AuthMode; body: SetAuthModeBody }>({
    mutationFn: input => APIRequest.put(`/admin/auth-modes/${input.method}`).body(input.body).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminAuthModeKeys.all }),
  });
}

export function useCreateGlobalIdentityProviderMutation(): UseMutationResult<GlobalIdentityProviderItem, ApiError, CreateGlobalIdentityProviderBody> {
  const queryClient = useQueryClient();
  return useMutation<GlobalIdentityProviderItem, ApiError, CreateGlobalIdentityProviderBody>({
    mutationFn: body => APIRequest.post('/admin/identity-providers').body(body).execute<GlobalIdentityProviderItem>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminAuthModeKeys.all }),
  });
}

export function useUpdateGlobalIdentityProviderMutation(): UseMutationResult<GlobalIdentityProviderItem, ApiError, { id: string; body: UpdateGlobalIdentityProviderBody }> {
  const queryClient = useQueryClient();
  return useMutation<GlobalIdentityProviderItem, ApiError, { id: string; body: UpdateGlobalIdentityProviderBody }>({
    mutationFn: input => APIRequest.patch(`/admin/identity-providers/${input.id}`).body(input.body).execute<GlobalIdentityProviderItem>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminAuthModeKeys.all }),
  });
}

export function useDeleteGlobalIdentityProviderMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: id => APIRequest.delete(`/admin/identity-providers/${id}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminAuthModeKeys.all }),
  });
}
